import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { setPinned } from "./pin.ts";
import { getRun } from "./queries.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let ctx: ServiceCtx;
const now = new Date("2026-09-24T12:00:00.000Z");
const sessionRun = ulid();
const ticketRun = ulid();
const flowRun = ulid();
const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO agent_runs
		(id, name, kind, instruction, project_key, ticket_identifier, closed_at, created_at, updated_at) VALUES
		(${sessionRun}, 'standalone', 'session', 'Work', '', NULL, NULL, ${now}, ${now}),
		(${ticketRun}, 'ticket', 'agent', 'Work', 'TRL', 'TRL-463', ${now}, ${now}, ${now}),
		(${flowRun}, 'flow', 'flow', 'Review', 'TRL', NULL, ${now}, ${now}, ${now})`);
	const cache = createCache();
	await run((tx) => cache.rebuild(tx));
	ctx = {
		actor: { kind: "human", name: "qa" },
		session: null,
		reqId: ulid(),
		now,
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => db.$client.close());

test("a pin persists on a standalone session after its process assignment closes", async () => {
	expect(await run((tx) => setPinned(ctx, tx, { id: sessionRun, pinned: true }))).toEqual({
		id: sessionRun,
		pinnedAt: now.toISOString(),
	});
	await db.execute(sql`UPDATE agent_runs SET closed_at = ${now} WHERE id = ${sessionRun}`);
	expect((await run((tx) => getRun(tx, sessionRun))).pinnedAt).toBe(now.toISOString());
});

test("a ticket agent can be pinned without a sessions row and then unpinned", async () => {
	expect(await run((tx) => setPinned(ctx, tx, { id: ticketRun, pinned: true }))).toEqual({
		id: ticketRun,
		pinnedAt: now.toISOString(),
	});
	expect(await run((tx) => setPinned(ctx, tx, { id: ticketRun, pinned: false }))).toEqual({
		id: ticketRun,
		pinnedAt: null,
	});
});

test("a flow run cannot be pinned", async () => {
	await expect(run((tx) => setPinned(ctx, tx, { id: flowRun, pinned: true }))).rejects.toThrow(
		"A flow run cannot be pinned.",
	);
});
