import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { TrellisEvent } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { getSessionUpdateRequest, getSessionUpdates } from "../sessionUpdates/queries.ts";
import {
	beginSessionUpdateRequest,
	sessionUpdateRequestIsOutstanding,
	setSessionUpdateRequestState,
} from "../sessionUpdates/requests.ts";
import { write } from "../sessionUpdates/sessionUpdates.ts";
import type { IoCtx } from "../support.ts";
import { prepareSessionStatusRequests, type SessionStatusRequestDeps } from "./dispatch.ts";

const at = new Date("2026-09-29T12:05:00.000Z");

const fixture = async () => {
	const db = await openTestDb();
	const runId = ulid();
	const sessionId = ulid();
	const terminalId = crypto.randomUUID();
	const token = crypto.randomUUID();
	const events: TrellisEvent[] = [];
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, harness, terminal_id, created_at, updated_at)
		VALUES (${runId}, 'Session agent', 'session', 'Work.', NULL, '', '{"preset":"codex"}'::jsonb,
		${terminalId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${sessionId}, 'Status session', '/tmp/status-session', '{"preset":"codex"}'::jsonb,
		${runId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts
		(id, run_id, generation, token_hash, created_at) VALUES
		(${terminalId}, ${runId}, 1, ${createHash("sha256").update(token).digest("hex")}, ${at})`);
	const core: ServiceCtx = {
		actor: { kind: "agent", name: runId },
		session: null,
		attemptToken: token,
		reqId: ulid(),
		now: at,
		emit: (event) => events.push(event),
		cache: createCache(),
		actorCache: new Map(),
		dropBlobs: () => {},
		publicUrl: "http://127.0.0.1:4521",
	};
	const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);
	const io = {
		core,
		home: "/tmp",
		now: () => at,
		newTx: inTx,
	} as IoCtx;
	return { db, runId, sessionId, terminalId, core, io, inTx };
};

const processStatus = (terminalId: string, requestId: string): RuntimeProcessStatus => ({
	id: terminalId,
	daemonId: "runtime",
	pid: 1,
	mode: "pty",
	status: "running",
	startedAt: at.toISOString(),
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 300_000,
	agent: null,
	acknowledgedMessageIds: [requestId],
	activity: { state: "idle", updatedAt: at.toISOString() },
	checkedAt: at.toISOString(),
	controllable: true,
	process: null,
	launch: null,
	result: null,
});

const dependencies = (value: Awaited<ReturnType<typeof fixture>>, requestId: string): SessionStatusRequestDeps => ({
	candidates: async () => [{ sessionId: value.sessionId, runId: value.runId, terminalId: value.terminalId }],
	runtime: async () => [processStatus(value.terminalId, requestId)],
	requests: async () =>
		new Map([[value.sessionId, await value.inTx((tx) => getSessionUpdateRequest(tx, { sessionId: value.sessionId }))]]),
	beginRequest: (_ctx, sessionId, nextRequestId) =>
		value.inTx((tx) => beginSessionUpdateRequest(value.core, tx, { sessionId, requestId: nextRequestId })),
	setRequest: (_ctx, input) => value.inTx((tx) => setSessionUpdateRequestState(value.core, tx, input)),
	send: async () => {},
	requestId: () => crypto.randomUUID(),
});

test("a completed status turn clears its outstanding request", async () => {
	const value = await fixture();
	try {
		const requestId = crypto.randomUUID();
		await value.inTx((tx) => beginSessionUpdateRequest(value.core, tx, { sessionId: value.sessionId, requestId }));
		await value.inTx((tx) =>
			setSessionUpdateRequestState(value.core, tx, { sessionId: value.sessionId, requestId, state: "sent" }),
		);
		await prepareSessionStatusRequests(value.io, {}, dependencies(value, requestId));

		const saved = await value.inTx((tx) => getSessionUpdates(tx, { sessionId: value.sessionId }));
		expect(saved.request).toMatchObject({ requestId, state: "failed" });
		expect(sessionUpdateRequestIsOutstanding(saved.request!.state)).toBe(false);
	} finally {
		await value.db.$client.close();
	}
});

test("an agent reply wins the race with completion", async () => {
	const value = await fixture();
	try {
		const requestId = crypto.randomUUID();
		await value.inTx((tx) => beginSessionUpdateRequest(value.core, tx, { sessionId: value.sessionId, requestId }));
		await value.inTx((tx) =>
			setSessionUpdateRequestState(value.core, tx, { sessionId: value.sessionId, requestId, state: "sent" }),
		);
		const deps = dependencies(value, requestId);
		deps.setRequest = async (_ctx, input) => {
			await value.inTx((tx) =>
				write(value.core, tx, { sessionId: value.sessionId, requestId, body: "The status reply won the race." }),
			);
			return value.inTx((tx) => setSessionUpdateRequestState(value.core, tx, input));
		};
		await prepareSessionStatusRequests(value.io, {}, deps);

		const saved = await value.inTx((tx) => getSessionUpdates(tx, { sessionId: value.sessionId }));
		expect(saved.latest?.body).toBe("The status reply won the race.");
		expect(saved.request).toMatchObject({ requestId, state: "answered", error: null });
		expect(sessionUpdateRequestIsOutstanding(saved.request!.state)).toBe(false);
	} finally {
		await value.db.$client.close();
	}
});
