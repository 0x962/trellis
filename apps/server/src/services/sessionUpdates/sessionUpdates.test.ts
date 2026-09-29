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
const projectId = ulid();
const statusId = ulid();
const ticketId = ulid();
const ticketRunId = ulid();
const standaloneRunId = ulid();
const standaloneSessionId = ulid();
const oldAttemptId = crypto.randomUUID();
const ticketAttemptId = crypto.randomUUID();
const standaloneAttemptId = crypto.randomUUID();
const oldToken = "old-token";
const ticketToken = "ticket-token";
const standaloneToken = "standalone-token";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const inTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

const context = (runId: string, attemptToken: string, fields: Partial<ServiceCtx> = {}): ServiceCtx => ({
	actor: { kind: "agent", name: runId },
	session: null,
	attemptToken,
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
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${projectId}, 'TST', 'test', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${projectId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES (${ticketId}, ${projectId}, 1, 'Ticket work', ${statusId}, 0, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, harness,
		terminal_id, created_at, updated_at) VALUES
		(${ticketRunId}, 'Ticket agent', 'agent', 'Work.', ${projectId}, 'TST', ${ticketId}, 'TST-1',
		'{"preset":"codex"}'::jsonb, ${ticketAttemptId}, ${at}, ${at}),
		(${standaloneRunId}, 'Session agent', 'session', 'Work.', NULL, '', NULL, NULL,
		'{"preset":"codex"}'::jsonb, ${standaloneAttemptId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
		VALUES (${standaloneSessionId}, 'Status session', '/tmp/status-session',
		'{"preset":"codex"}'::jsonb, ${standaloneRunId}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_execution_attempts
		(id, run_id, generation, token_hash, created_at) VALUES
		(${oldAttemptId}, ${ticketRunId}, 1, ${hash(oldToken)}, ${at}),
		(${ticketAttemptId}, ${ticketRunId}, 2, ${hash(ticketToken)}, ${at}),
		(${standaloneAttemptId}, ${standaloneRunId}, 1, ${hash(standaloneToken)}, ${at})`);
});

afterAll(async () => {
	await db.$client.close();
});

test("saves one requested reply for a ticket agent without a sessions row", async () => {
	const requestId = crypto.randomUUID();
	const ctx = context(ticketRunId, ticketToken);
	const request = await inTx((tx) => beginSessionUpdateRequest(ctx, tx, { runId: ticketRunId, requestId }));
	expect(request?.state).toBe("pending");
	expect(await inTx((tx) => beginSessionUpdateRequest(ctx, tx, { runId: ticketRunId, requestId }))).toEqual(request);
	const first = await inTx((tx) =>
		write(ctx, tx, {
			sessionId: ticketRunId,
			requestId,
			body: "I found the request boundary.",
			embeds: [{ title: "Proof", html: "<p>Saved</p>" }],
		}),
	);
	const duplicate = await inTx((tx) =>
		write(ctx, tx, { sessionId: ticketRunId, requestId, body: "Do not replace the first reply." }),
	);
	expect(duplicate).toEqual(first);
	expect(first).toMatchObject({ sessionId: null, runId: ticketRunId });
	expect(
		(await inTx((tx) => setSessionUpdateRequestState(ctx, tx, { runId: ticketRunId, requestId, state: "sent" }))).state,
	).toBe("answered");
	const sessions = await db.execute(sql`SELECT id FROM sessions WHERE run_id=${ticketRunId}`);
	expect(sessions.rows).toEqual([]);
	expect(events).toContainEqual({ type: "session-updates.changed", id: ticketRunId });
});

test("resolves a standalone session name and stores its session provenance", async () => {
	const ctx = context(standaloneRunId, standaloneToken, { now: new Date(at.getTime() + 1) });
	const update = await inTx((tx) => write(ctx, tx, { sessionId: "Status session", body: "I will add the CLI next." }));
	expect(update).toMatchObject({ sessionId: standaloneSessionId, runId: standaloneRunId });
	const saved = await inTx((tx) =>
		get(context(standaloneRunId, standaloneToken, { actor: { kind: "human", name: "Navid" } }), tx, {
			sessionId: "Status session",
		}),
	);
	expect(saved.latest).toMatchObject({ id: update.id, body: "I will add the CLI next." });
});

test("rejects a human, another agent, and a stale ticket execution attempt", async () => {
	await expect(
		inTx((tx) =>
			write(context(ticketRunId, ticketToken, { actor: { kind: "human", name: "Navid" } }), tx, {
				sessionId: ticketRunId,
				body: "Human write.",
			}),
		),
	).rejects.toMatchObject({ code: "SESSION_UPDATE_FORBIDDEN", status: 403 });
	await expect(
		inTx((tx) => write(context(ulid(), ticketToken), tx, { sessionId: ticketRunId, body: "Wrong owner." })),
	).rejects.toMatchObject({ code: "SESSION_UPDATE_FORBIDDEN", status: 403 });
	await expect(
		inTx((tx) => write(context(ticketRunId, oldToken), tx, { sessionId: ticketRunId, body: "Stale attempt." })),
	).rejects.toThrow("This agent execution attempt cannot change Trellis.");
});

test("keeps a ticket reply after the run completes and the database restarts", async () => {
	await db.execute(sql`UPDATE agent_runs SET closed_at=${at} WHERE id=${ticketRunId}`);
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openTestDbFromArchive(archive);

	const saved = await inTx((tx) =>
		get(context(ticketRunId, ticketToken, { actor: { kind: "human", name: "Navid" } }), tx, {
			sessionId: ticketRunId,
		}),
	);
	expect(saved.latest).toMatchObject({ body: "I found the request boundary.", sessionId: null, runId: ticketRunId });
	expect(saved.request).toMatchObject({ state: "answered", error: null });
});
