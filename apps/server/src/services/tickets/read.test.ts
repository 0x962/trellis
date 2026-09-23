import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { createCache, type ProjectCache } from "../../db/cache.ts";
import { openTestDb } from "../../db/testDb.ts";
import { list } from "./read.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
let cache: ProjectCache;
let ctx: ServiceCtx;
const root = ulid();
const todo = ulid();
const done = ulid();
const ticketIds = Array.from({ length: 5 }, () => ulid());
const at = "2026-09-21T10:00:00.000Z";

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${root}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses
		(id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES
		(${todo}, ${root}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
		(${done}, ${root}, 'Done', 'done', 'done', 'success', 1, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets
		(id, project_id, number, title, status_id, position, created_at, updated_at)
		VALUES
		(${ticketIds[0]}, ${root}, 1, 'Done dependency', ${done}, 1, ${at}, ${at}),
		(${ticketIds[1]}, ${root}, 2, 'Open dependency', ${todo}, 2, ${at}, ${at}),
		(${ticketIds[2]}, ${root}, 3, 'Waits on both', ${todo}, 3, ${at}, ${at}),
		(${ticketIds[3]}, ${root}, 4, 'Waits on done', ${todo}, 4, ${at}, ${at}),
		(${ticketIds[4]}, ${root}, 5, 'Waits on nothing', ${todo}, 5, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO ticket_deps (ticket_id, depends_on_id, source, created_at)
		VALUES
		(${ticketIds[2]}, ${ticketIds[0]}, 'manual', ${at}),
		(${ticketIds[2]}, ${ticketIds[1]}, 'manual', ${at}),
		(${ticketIds[3]}, ${ticketIds[0]}, 'manual', ${at})`);
	cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	ctx = {
		actor: null,
		session: null,
		reqId: ulid(),
		now: new Date(at),
		cache,
		actorCache: new Map(),
		emit: () => {},
		dropBlobs: () => {},
		publicUrl: "http://localhost:4597",
	};
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

const identifiers = async (query: Record<string, unknown>) => {
	const page = await db.transaction((tx) => list(ctx, tx, { project: "TST", sort: "number", ...query }));
	return page.items.map((item) => item.identifier);
};

test("waitsOn keeps every ticket with an edge to the named dependency", async () => {
	expect(await identifiers({ waitsOn: "TST-1" })).toEqual(["TST-3", "TST-4"]);
	expect(await identifiers({ waitsOn: "TST-2" })).toEqual(["TST-3"]);
});

test("blocked tests for an open dependency", async () => {
	expect(await identifiers({ blocked: true })).toEqual(["TST-3"]);
	expect(await identifiers({ blocked: false })).toEqual(["TST-1", "TST-2", "TST-4", "TST-5"]);
	expect(await identifiers({ waitsOn: "TST-1", blocked: false })).toEqual(["TST-4"]);
});

test("waitsOn refuses a ticket ref that does not exist", async () => {
	await expect(identifiers({ waitsOn: "TST-99" })).rejects.toMatchObject({
		code: "NOT_FOUND",
		data: { kind: "ticket", ref: "TST-99" },
	});
});
