import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { list } from "../services/tickets/read.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

// One root TST with one status, one epic `TST/plan`, and three tickets:
// TST-1 and TST-3 in the epic, TST-2 outside every epic.
let db: Db;
let cache: ProjectCache;
let ctx: ServiceCtx;
const tst = ulid();
const epic = ulid();
const at = "2026-09-18T10:00:00.000Z";

const insertTicket = (id: string, number: number, status: string, epicId: string | null) =>
	db.execute(sql`INSERT INTO tickets (id, project_id, number, title, status_id, epic_id, position, created_at, updated_at)
		VALUES (${id}, ${tst}, ${number}, ${`Ticket ${number}`}, ${status}, ${epicId}, ${number}, ${at}, ${at})`);

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('Test', 'human', ${at}, ${at})`,
	);
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${tst}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	const status = ulid();
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${status}, ${tst}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epics (id, project_id, slug, name, description, actor_name, actor_kind, created_at, updated_at)
		VALUES (${epic}, ${tst}, 'plan', 'Plan', '', 'Test', 'human', ${at}, ${at})`);
	await insertTicket(ulid(), 1, status, epic);
	await insertTicket(ulid(), 2, status, null);
	await insertTicket(ulid(), 3, status, epic);
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

test("epic=<ref> keeps the tickets of that epic, by KEY/slug or by ULID", async () => {
	expect(await identifiers({ epic: "tst/PLAN" })).toEqual(["TST-1", "TST-3"]);
	expect(await identifiers({ epic })).toEqual(["TST-1", "TST-3"]);
});

test("epic=none keeps the tickets outside every epic", async () => {
	expect(await identifiers({ epic: "none" })).toEqual(["TST-2"]);
});

test("a row carries the epic link, and a ticket outside every epic carries null", async () => {
	const page = await db.transaction((tx) => list(ctx, tx, { project: "TST", sort: "number" }));
	expect(page.items.map((item) => item.epic)).toEqual([
		{ id: epic, ref: "TST/plan", name: "Plan" },
		null,
		{ id: epic, ref: "TST/plan", name: "Plan" },
	]);
});

test("an epic ref that names no epic is NOT_FOUND", async () => {
	await expect(identifiers({ epic: "TST/missing" })).rejects.toMatchObject({
		code: "NOT_FOUND",
		data: { kind: "epic", ref: "TST/missing" },
	});
});
