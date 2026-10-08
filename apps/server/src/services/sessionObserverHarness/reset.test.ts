import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Tx } from "../../db/tx.ts";
import { reserveObserverDelivery } from "../agentRuns/observerRuns/index.ts";
import { getRun } from "../agentRuns/queries.ts";
import {
	finishSessionObserverReset,
	type PreparedSessionObserverReset,
	prepareSessionObserverReset,
	setSessionObserverEnabled,
} from "../sessionObserverGeneration/index.ts";
import {
	claimSessionObserverGeneration,
	failSessionObserverGeneration,
	linkSessionObserverRun,
	readSessionObserver,
	readSessionObserverHistory,
	saveSessionObserverGeneration,
	setEnabled,
} from "../sessionObservers/index.ts";
import { at, context, seed } from "../sessionObservers/testFixture/index.ts";
import { get as getSessionUpdates } from "../sessionUpdates/get.ts";
import type { IoCtx } from "../support.ts";
import { ensureSessionObserverRun } from "./ensureSessionObserverRun/index.ts";
import { ObserverHarnessError, SESSION_OBSERVER_MODEL } from "./types.ts";

type TestDb = Awaited<ReturnType<typeof seed>>["db"];

const requestId = "7c4c1f52-0a1e-4b0d-9f3a-2a0e6f1c8d41";

// A failed observer: it holds two saved messages, one status update, the
// cursor it consumed, one stopped Claude attempt, and a recorded failure.
const failedObserver = async () => {
	const { db, ticketRunId } = await seed();
	const core = context([]);
	const ctx = {
		core,
		actor: core.actor!,
		home: "/unused-observer-reset",
		now: () => at,
		newTx: <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn),
		afterCommit: () => {},
	} as unknown as IoCtx;
	const accountId = ulid();
	const workerSessionId = ulid();
	await db.execute(sql`INSERT INTO harness_accounts (id,name,harness,profile_path,created_at,updated_at)
		VALUES (${accountId},'Fixture','claude','/unused-profile',${at},${at})`);
	await db.execute(sql`UPDATE agent_runs SET session_id=${workerSessionId} WHERE id=${ticketRunId}`);
	const enabled = await db.transaction((tx) => setEnabled(core, tx, { sessionId: ticketRunId, enabled: true }));
	const observerId = enabled.observer.observerId!;
	const first = (await db.transaction((tx) =>
		claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "cursor-1" }),
	))!;
	const hidden = await ensureSessionObserverRun(ctx, {
		observerId,
		sourceRunId: ticketRunId,
		modelId: SESSION_OBSERVER_MODEL,
		accountId,
	});
	await db.transaction((tx) => linkSessionObserverRun(tx, { runId: ticketRunId, claimId: first.claimId, ...hidden }));
	// One real delivery, so the observer run carries a stopped attempt and a
	// `session-observer` receipt that makes the next launch a resume.
	await reserveObserverDelivery(ctx, {
		observerId,
		sourceRunId: ticketRunId,
		...hidden,
		claimId: first.claimId,
		throughCursor: first.throughCursor,
		instruction: "Explain the supplied context.",
		userContext: "Context",
		signal: new AbortController().signal,
	});
	await db.transaction((tx) =>
		saveSessionObserverGeneration(core, tx, {
			runId: ticketRunId,
			claimId: first.claimId,
			throughCursor: first.throughCursor,
			messages: [
				{ role: "user", body: "Context" },
				{ role: "assistant", body: "The agent reads the ticket." },
			],
			update: { body: "The agent reads the ticket." },
		}),
	);
	const second = (await db.transaction((tx) =>
		claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "cursor-2" }),
	))!;
	await db.transaction((tx) =>
		failSessionObserverGeneration(core, tx, {
			runId: ticketRunId,
			claimId: second.claimId,
			error: { code: "CLAUDE_CONVERSATION_LOST", message: "The Claude conversation is gone." },
		}),
	);
	const observerRun = await db.transaction((tx) => getRun(tx, hidden.observerRunId));
	return { db, core, ctx, ticketRunId, observerId, observerRun, accountId, workerSessionId };
};

// Drives the registered service the way the transport does: the prepare step
// first, then the answering transaction. `recover` stands in for the runtime,
// which holds no observer process in a test.
const stopped = { recover: async () => {} };

const reset = async (ctx: IoCtx, db: TestDb, input: unknown, deps = stopped) => {
	const prepared: PreparedSessionObserverReset = await prepareSessionObserverReset(ctx, input as never, deps);
	return db.transaction((tx) => finishSessionObserverReset(ctx, tx, prepared));
};

test("a reset gives the failed observer an empty Claude conversation and keeps everything else", async () => {
	const { db, core, ctx, ticketRunId, observerId, observerRun, accountId, workerSessionId } = await failedObserver();
	try {
		const before = await db.transaction((tx) => readSessionObserver(tx, ticketRunId));
		expect(before).toMatchObject({
			enabled: true,
			lastConsumedCursor: "cursor-1",
			lastAttemptedCursor: "cursor-2",
			error: { code: "CLAUDE_CONVERSATION_LOST" },
			providerSessionId: observerRun.sessionId,
		});
		const input = {
			sessionId: ticketRunId,
			expectedRunId: ticketRunId,
			expectedObserverRunId: observerRun.id,
			expectedProviderSessionId: observerRun.sessionId!,
			requestId,
		};

		const after = await reset(ctx, db, input);

		// A new Claude conversation, and the observer waits for a person.
		expect(after.providerSessionId).not.toBe(observerRun.sessionId);
		expect(after.providerSessionId).not.toBeNull();
		expect(after.enabled).toBe(false);
		// Everything the observer learned stays.
		expect(after).toMatchObject({
			observerId,
			observerRunId: observerRun.id,
			lastConsumedCursor: "cursor-1",
			generationState: "idle",
			generation: before.generation,
			error: { code: "CLAUDE_CONVERSATION_LOST" },
		});
		const history = await db.transaction((tx) => readSessionObserverHistory(tx, ticketRunId));
		expect(history.messages.map((message) => message.body)).toEqual(["Context", "The agent reads the ticket."]);
		const updates = await db.transaction((tx) => getSessionUpdates(core, tx, { sessionId: ticketRunId }));
		expect(updates.latest).toMatchObject({ body: "The agent reads the ticket." });
		const observerRunAfter = await db.transaction((tx) => getRun(tx, observerRun.id));
		expect(observerRunAfter.workspaceId).toBe(observerRun.workspaceId);
		expect(observerRunAfter.terminalId).toBe(observerRun.terminalId);
		expect(observerRunAfter.closedAt).toBeNull();
		// The worker conversation of the observed session is untouched.
		expect(await db.transaction((tx) => getRun(tx, ticketRunId))).toMatchObject({
			sessionId: workerSessionId,
			closedAt: null,
		});

		// An identical repeat reports the same conversation and acts once.
		expect(await reset(ctx, db, input)).toEqual(after);
		const receipts = await db.execute(sql`SELECT request_id FROM agent_start_requests WHERE request_id=${requestId}`);
		expect(receipts.rows.length).toBe(1);

		// A person turns the observer on again. The next update opens the new
		// conversation through the text-only launch, with no summary seeded.
		const back = await db.transaction((tx) =>
			setSessionObserverEnabled(ctx, tx, { sessionId: ticketRunId, enabled: true }),
		);
		expect(back).toMatchObject({ enabled: true, error: null, lastAttemptedCursor: null });
		expect(back.providerSessionId).toBe(after.providerSessionId);
		const claim = (await db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "cursor-3" }),
		))!;
		const next = await reserveObserverDelivery(ctx, {
			observerId,
			sourceRunId: ticketRunId,
			observerRunId: observerRun.id,
			claimId: claim.claimId,
			throughCursor: claim.throughCursor,
			instruction: "Explain the supplied context.",
			userContext: "Later context",
			signal: new AbortController().signal,
		});
		expect(next).toMatchObject({
			replay: false,
			resume: false,
			seed: undefined,
			providerSessionId: after.providerSessionId,
		});
		expect(next.run.accountId).toBe(accountId);
		expect(next.run.harness).toMatchObject({ preset: "claude", model: SESSION_OBSERVER_MODEL });
	} finally {
		await db.$client.close();
	}
}, 30000);

test("a reset refuses a stale identity, a changed request, and an attempt that will not stop", async () => {
	const { db, ctx, ticketRunId, observerRun } = await failedObserver();
	try {
		const input = {
			sessionId: ticketRunId,
			expectedRunId: ticketRunId,
			expectedObserverRunId: observerRun.id,
			expectedProviderSessionId: observerRun.sessionId!,
			requestId,
		};
		const unchanged = async () => {
			expect((await db.transaction((tx) => getRun(tx, observerRun.id))).sessionId).toBe(observerRun.sessionId);
			expect((await db.transaction((tx) => readSessionObserver(tx, ticketRunId))).enabled).toBe(true);
		};

		await expect(reset(ctx, db, { ...input, expectedRunId: ulid() })).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
			data: { issues: [{ path: ["expectedRunId"] }] },
		});
		await unchanged();
		await expect(reset(ctx, db, { ...input, expectedObserverRunId: ulid() })).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
			data: { issues: [{ path: ["expectedObserverRunId"] }] },
		});
		await unchanged();
		await expect(reset(ctx, db, { ...input, expectedProviderSessionId: "stale" })).rejects.toMatchObject({
			code: "INPUT_VALIDATION_FAILED",
			data: { issues: [{ path: ["expectedProviderSessionId"] }] },
		});
		await unchanged();

		// The runtime cannot confirm the observer attempt stopped.
		const running = {
			recover: async () => {
				throw new ObserverHarnessError("OBSERVER_CANCEL_UNCONFIRMED", "The observer is still running.");
			},
		};
		await expect(reset(ctx, db, input, running)).rejects.toMatchObject({
			code: "RUNNER_UNAVAILABLE",
			status: 503,
			data: { reason: "error" },
		});
		await unchanged();

		// An agent cannot reset an observer.
		const agent = { ...ctx, actor: { kind: "agent" as const, name: "worker" } } as IoCtx;
		await expect(prepareSessionObserverReset(agent, input as never)).rejects.toMatchObject({
			code: "SESSION_OBSERVER_FORBIDDEN",
		});
		await unchanged();

		// The reset succeeds, and the same request ID cannot name a second one.
		const after = await reset(ctx, db, input);
		expect(after.providerSessionId).not.toBe(observerRun.sessionId);
		await expect(
			reset(ctx, db, { ...input, expectedProviderSessionId: after.providerSessionId! }),
		).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED", data: { issues: [{ path: ["requestId"] }] } });
	} finally {
		await db.$client.close();
	}
}, 30000);
