import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getRun } from "../agentRuns/queries.ts";
import {
	claimSessionObserverGeneration,
	linkSessionObserverRun,
	readSessionObserver,
	recoverSessionObserverGenerations,
	saveSessionObserverSummary,
	setEnabled,
} from "../sessionObservers/index.ts";
import { at, context, seed } from "../sessionObservers/testFixture.ts";
import type { IoCtx } from "../support.ts";
import { listUsageRuns } from "../usage/queries.ts";
import { ensureSessionObserverRun } from "./ensureSessionObserverRun.ts";
import { removeSessionObserverWorkspace } from "./removeSessionObserverWorkspace.ts";
import { reserveObserverDelivery } from "./reserveObserverDelivery.ts";
import { rolloverSessionObserverConversation } from "./rolloverSessionObserverConversation.ts";
import { SESSION_OBSERVER_MODEL } from "./types.ts";

test("reserves one hidden Claude conversation and reuses its exact delivery after claim recovery", async () => {
	const { db, ticketRunId } = await seed();
	try {
		const core = context([]);
		const ctx = { core, home: "/unused-observer-fixture", now: () => at, newTx: (fn) => db.transaction(fn) } as IoCtx;
		const accountId = ulid();
		await db.execute(sql`INSERT INTO harness_accounts (id,name,harness,profile_path,created_at,updated_at)
			VALUES (${accountId},'Fixture','claude','/unused-profile',${at},${at})`);
		const enabled = await db.transaction((tx) => setEnabled(core, tx, { sessionId: ticketRunId, enabled: true }));
		const claim = (await db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "cursor" }),
		))!;
		const identity = {
			observerId: enabled.observer.observerId!,
			sourceRunId: ticketRunId,
			modelId: SESSION_OBSERVER_MODEL,
			accountId,
		};
		await expect(
			ensureSessionObserverRun(ctx, { ...identity, modelId: "anthropic/claude-sonnet-5" }),
		).rejects.toMatchObject({ code: "OBSERVER_MODEL_UNAVAILABLE" });
		await expect(ensureSessionObserverRun(ctx, { ...identity, accountId: "missing" })).rejects.toMatchObject({
			code: "OBSERVER_ACCOUNT_UNAVAILABLE",
		});
		const hidden = await ensureSessionObserverRun(ctx, identity);
		expect(await ensureSessionObserverRun(ctx, identity)).toEqual(hidden);
		expect(hidden.observerRunId).not.toBe(ticketRunId);
		const run = await db.transaction((tx) => getRun(tx, hidden.observerRunId));
		expect(run).toMatchObject({
			kind: "session",
			ticketId: null,
			accountId,
			terminalId: null,
			harness: { preset: "claude", model: SESSION_OBSERVER_MODEL },
		});
		expect((await db.transaction((tx) => getRun(tx, ticketRunId))).sessionId).toBeNull();
		const input = {
			...identity,
			...hidden,
			claimId: claim.claimId,
			throughCursor: claim.throughCursor,
			instruction: "Explain the supplied context.",
			userContext: "Context",
			signal: new AbortController().signal,
		};
		await expect(reserveObserverDelivery(ctx, input)).rejects.toMatchObject({ code: "OBSERVER_DISABLED" });
		await db.transaction((tx) => linkSessionObserverRun(tx, { runId: ticketRunId, claimId: claim.claimId, ...hidden }));
		const first = await reserveObserverDelivery(ctx, input);
		expect(first.replay).toBe(false);
		const duplicate = await reserveObserverDelivery(ctx, input);
		expect(duplicate).toMatchObject({ replay: true, attemptId: first.attemptId });
		await expect(reserveObserverDelivery(ctx, { ...input, userContext: "Changed" })).rejects.toMatchObject({
			code: "OBSERVER_DELIVERY_UNKNOWN",
		});
		await db.transaction((tx) => recoverSessionObserverGenerations(core, tx));
		const replacement = (await db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "cursor" }),
		))!;
		const recovered = await reserveObserverDelivery(ctx, { ...input, claimId: replacement.claimId });
		expect(recovered).toMatchObject({ replay: true, attemptId: first.attemptId });
		const next = await reserveObserverDelivery(ctx, {
			...input,
			claimId: replacement.claimId,
			deliveryId: "summary",
			userContext: "Summarize this chunk",
		});
		expect(next.replay).toBe(false);
		expect(next.attemptId).not.toBe(first.attemptId);
		expect(next.run.sessionId).toBe(run.sessionId);
		const rollover = {
			sourceRunId: ticketRunId,
			...hidden,
			claimId: replacement.claimId,
			expectedProviderSessionId: run.sessionId!,
			summaryMessageId: ulid(),
		};
		const recover = async () => {};
		await expect(rolloverSessionObserverConversation(ctx, rollover, { recover })).rejects.toMatchObject({
			code: "OBSERVER_DISABLED",
		});
		expect((await db.transaction((tx) => getRun(tx, hidden.observerRunId))).sessionId).toBe(run.sessionId);
		const summary = (await db.transaction((tx) =>
			saveSessionObserverSummary(core, tx, {
				runId: ticketRunId,
				claimId: replacement.claimId,
				message: { role: "user", body: "Durable summary" },
			}),
		))!;
		rollover.summaryMessageId = summary.id;
		const segment = await rolloverSessionObserverConversation(ctx, rollover, { recover });
		expect(segment.providerSessionId).not.toBe(run.sessionId);
		expect(await rolloverSessionObserverConversation(ctx, rollover, { recover })).toEqual(segment);
		const seeded = await reserveObserverDelivery(ctx, {
			...input,
			claimId: replacement.claimId,
			deliveryId: "narrative",
			userContext: "New narrative context",
		});
		expect(seeded).toMatchObject({
			replay: false,
			resume: false,
			seed: "Durable summary",
			providerSessionId: segment.providerSessionId,
		});
		await db.transaction((tx) => recoverSessionObserverGenerations(core, tx));
		const later = (await db.transaction((tx) =>
			claimSessionObserverGeneration(tx, { runId: ticketRunId, throughCursor: "different-cursor" }),
		))!;
		const sameTextNewActivity = await reserveObserverDelivery(ctx, {
			...input,
			claimId: later.claimId,
			throughCursor: later.throughCursor,
			deliveryId: "narrative",
			userContext: "New narrative context",
		});
		expect(sameTextNewActivity.replay).toBe(false);
		expect(sameTextNewActivity.attemptId).not.toBe(seeded.attemptId);
		const removed: string[] = [];
		await removeSessionObserverWorkspace(
			ctx,
			{ sourceRunId: ticketRunId },
			{
				recover: async () => {
					expect((await db.transaction((tx) => readSessionObserver(tx, ticketRunId))).enabled).toBe(false);
				},
				remove: async (path) => {
					removed.push(String(path));
				},
			},
		);
		expect(removed).toEqual([`${ctx.home}/observers/${hidden.observerRunId}`]);
		expect(await db.transaction((tx) => getRun(tx, hidden.observerRunId))).toMatchObject({
			workspaceId: null,
			sessionId: segment.providerSessionId,
			closedAt: at.toISOString(),
		});
		expect((await db.transaction((tx) => readSessionObserver(tx, ticketRunId))).observerRunId).toBe(
			hidden.observerRunId,
		);
		const usageRuns = await db.transaction((tx) => listUsageRuns(tx, ctx.home, at));
		expect(
			usageRuns
				.filter((item) => item.id === hidden.observerRunId)
				.map((item) => item.sessionId)
				.sort(),
		).toEqual([run.sessionId, segment.providerSessionId].sort());
		await db.transaction((tx) => setEnabled(core, tx, { sessionId: ticketRunId, enabled: false }));
		await expect(reserveObserverDelivery(ctx, { ...input, claimId: replacement.claimId })).rejects.toMatchObject({
			code: "OBSERVER_DISABLED",
		});
	} finally {
		await db.$client.close();
	}
}, 30000);
