import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import type { SessionUpdates, SessionUpdatesGetInput, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb, openTestDbFromArchive } from "../../db/testDb.ts";
import type { ServiceTransport } from "../../db/transport.ts";
import type { Tx } from "../../db/tx.ts";
import type { GhAccess } from "../../ghState.ts";
import type { ProcedureContext } from "../../procedures/base.ts";
import { sessionUpdates } from "../../procedures/sessionUpdates.ts";
import { createDbTiming } from "../../serverTiming.ts";
import { beginSessionUpdateRequest, get, setSessionUpdateRequestState, write } from "./index.ts";

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

test("rejects a status request for an unknown run", async () => {
	await expect(
		inTx((tx) =>
			beginSessionUpdateRequest(context(ticketRunId, ticketToken), tx, {
				runId: ulid(),
				requestId: crypto.randomUUID(),
			}),
		),
	).rejects.toThrow();
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

const readHistoryOverHttp = async (
	ctx: ServiceCtx,
	before?: NonNullable<SessionUpdatesGetInput["history"]>["before"],
): Promise<SessionUpdates> => {
	const query = new URLSearchParams({ "history[include]": "true" });
	if (before) {
		query.set("history[before][createdAt]", before.createdAt);
		query.set("history[before][id]", before.id);
	}
	const raw = new Request(`http://trellis.test/api/session-updates/${standaloneRunId}?${query}`);
	const handler = new OpenAPIHandler<ProcedureContext>({ sessionUpdates });
	const result = await handler.handle(raw, {
		prefix: "/api",
		context: {
			headers: raw.headers,
			reqId: "history-http",
			actor: null,
			timing: createDbTiming(),
			transport: {
				call: (_name: string, _ctx: unknown, input: SessionUpdatesGetInput) => inTx((tx) => get(ctx, tx, input)),
			} as ServiceTransport,
			gh: {} as GhAccess,
			chooseDirectory: async () => null,
		},
	});
	expect(result.matched).toBe(true);
	expect(result.response!.status).toBe(200);
	return result.response!.json();
};

test("reads every history page over HTTP without changing latest/previous and excludes another run", async () => {
	const ids = Array.from({ length: 105 }, () => ulid())
		.sort()
		.reverse();
	for (const id of ids) {
		await db.execute(sql`INSERT INTO session_updates (id, session_id, run_id, body, embeds, created_at)
			VALUES (${id}, ${standaloneSessionId}, ${standaloneRunId}, ${id}, '[]'::jsonb, '2026-09-30T12:00:00Z')`);
	}
	const ctx = context(standaloneRunId, standaloneToken, { actor: { kind: "human", name: "Navid" } });
	const first = await readHistoryOverHttp(ctx);
	expect(first.history?.map((item) => item.id)).toEqual(ids.slice(0, 50));
	expect(first.latest?.id).toBe(ids[0]);
	expect(first.previous?.id).toBe(ids[1]);
	await db.execute(sql`INSERT INTO session_updates (id, run_id, body, embeds, created_at)
		VALUES (${ulid()}, ${standaloneRunId}, 'New arrival', '[]'::jsonb, '2026-10-01T12:00:00Z')`);
	const second = await readHistoryOverHttp(ctx, first.nextCursor!);
	expect(second.history?.map((item) => item.id)).toEqual(ids.slice(50, 100));
	expect(second.latest?.body).toBe("New arrival");
	const third = await readHistoryOverHttp(ctx, second.nextCursor!);
	expect(third.history?.slice(0, 5).map((item) => item.id)).toEqual(ids.slice(100));
	expect(third.history?.every((item) => item.runId === standaloneRunId)).toBe(true);
	expect(third.nextCursor).toBeNull();
	const standard = await inTx((tx) => get(ctx, tx, { sessionId: standaloneRunId }));
	expect(standard.history).toBeUndefined();
	expect(standard.latest).toEqual(second.latest);
});
