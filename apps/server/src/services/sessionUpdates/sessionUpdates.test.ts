import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { beginSessionUpdateRequest, setSessionUpdateRequestState } from "./requests.ts";
import { get, write } from "./sessionUpdates.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const cache = createCache();
const events: TrellisEvent[] = [];
const at = new Date("2026-09-29T05:00:00.000Z");
const runId = ulid();
const sessionId = ulid();
const oldAttemptId = crypto.randomUUID();
const attemptId = crypto.randomUUID();
const oldToken = "old-token";
const token = "current-token";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const context = (fields: Partial<ServiceCtx> = {}): ServiceCtx => ({
	actor: { kind: "agent", name: runId },
	session: null,
	attemptToken: token,
	reqId: ulid(),
	now: at,
	emit: (event) => events.push(event),
	cache,
	actorCache: new Map(),
	dropBlobs: () => {},
	publicUrl: "http://127.0.0.1:4521",
	...fields,
});

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, harness, terminal_id, created_at, updated_at)
		VALUES (${runId}, 'Session agent', 'session', 'Work.', NULL, '', '{"preset":"codex"}'::jsonb,
		${attemptId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${sessionId}, 'Status session', '/tmp/status-session', '{"preset":"codex"}'::jsonb,
		${runId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts
		(id, run_id, generation, token_hash, created_at) VALUES
		(${oldAttemptId}, ${runId}, 1, ${hash(oldToken)}, ${at}),
		(${attemptId}, ${runId}, 2, ${hash(token)}, ${at})`);
});

afterAll(async () => {
	await db.$client.close();
});

test("saves replies once and reads the latest and previous replies", async () => {
	const requestId = crypto.randomUUID();
	const ctx = context();
	const request = await inTx((tx) => beginSessionUpdateRequest(ctx, tx, { sessionId, requestId }));
	expect(request?.state).toBe("pending");
	expect(await inTx((tx) => beginSessionUpdateRequest(ctx, tx, { sessionId, requestId }))).toEqual(request);
	expect(
		await inTx((tx) => beginSessionUpdateRequest(ctx, tx, { sessionId, requestId: crypto.randomUUID() })),
	).toBeNull();
	const first = await inTx((tx) =>
		write(ctx, tx, {
			sessionId,
			requestId,
			body: "I found the request boundary.",
			embeds: [{ title: "Proof", html: "<p>Saved</p>" }],
		}),
	);
	const duplicate = await inTx((tx) =>
		write(ctx, tx, { sessionId, requestId, body: "A duplicate body must not replace the first body." }),
	);
	expect(duplicate).toEqual(first);
	expect(
		(await inTx((tx) => setSessionUpdateRequestState(ctx, tx, { sessionId, requestId, state: "sent" }))).state,
	).toBe("answered");

	const second = await inTx((tx) =>
		write(context({ now: new Date(at.getTime() + 1) }), tx, { sessionId, body: "I will add the CLI next." }),
	);
	const saved = await inTx((tx) => get(context({ actor: { kind: "human", name: "Navid" } }), tx, { sessionId }));
	expect(saved).toMatchObject({
		latest: { id: second.id, body: "I will add the CLI next." },
		previous: { id: first.id, body: "I found the request boundary." },
		request: { requestId, state: "answered", error: null },
	});
	expect(events.some((event) => event.type === "session-updates.changed")).toBe(true);
});

test("keeps the latest reply when the next request fails", async () => {
	const requestId = crypto.randomUUID();
	const ctx = context({ now: new Date(at.getTime() + 5 * 60 * 1000) });
	await inTx((tx) => beginSessionUpdateRequest(ctx, tx, { sessionId, requestId }));
	await inTx((tx) => setSessionUpdateRequestState(ctx, tx, { sessionId, requestId, state: "sent" }));
	await inTx((tx) =>
		setSessionUpdateRequestState(ctx, tx, { sessionId, requestId, state: "failed", error: "No side channel." }),
	);
	const saved = await inTx((tx) => get(ctx, tx, { sessionId }));
	expect(saved.latest?.body).toBe("I will add the CLI next.");
	expect(saved.request).toMatchObject({ requestId, state: "failed", error: "No side channel." });
});

test("refuses a human, another agent, and a stale execution attempt", async () => {
	for (const actor of [
		{ kind: "human" as const, name: "Navid" },
		{ kind: "agent" as const, name: ulid() },
	])
		await expect(
			inTx((tx) => write(context({ actor }), tx, { sessionId, body: "Wrong owner." })),
		).rejects.toMatchObject({ code: "SESSION_UPDATE_FORBIDDEN", status: 403 });
	await expect(
		inTx((tx) => write(context({ attemptToken: oldToken }), tx, { sessionId, body: "Stale attempt." })),
	).rejects.toThrow("This agent execution attempt cannot change Trellis.");
});

test("keeps saved replies after the process exits and the database restarts", async () => {
	await db.execute(sql`UPDATE agent_runs SET closed_at=${at} WHERE id=${runId}`);
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openTestDbFromArchive(archive);

	const saved = await inTx((tx) => get(context({ actor: { kind: "human", name: "Navid" } }), tx, { sessionId }));
	expect(saved.latest?.body).toBe("I will add the CLI next.");
	expect(saved.previous?.body).toBe("I found the request boundary.");
});
