import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { list } from "../services/tickets/read.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";

// One root TST with one status, one epic `TST/plan` with the milestone
// `TST/plan/phase-1`, and three tickets: TST-1 in the milestone, TST-2
// outside every epic, and TST-3 in the epic with no milestone.
let db: Db;
let cache: ProjectCache;
let ctx: ServiceCtx;
const tst = ulid();
const epic = ulid();
const milestone = ulid();
const at = "2026-09-18T10:00:00.000Z";

const insertTicket = (number: number, status: string, epicId: string | null, milestoneId: string | null) =>
	db.execute(sql`INSERT INTO tickets (id, project_id, root_id, number, title, status_id, epic_id, milestone_id, position, created_at, updated_at)
		VALUES (${ulid()}, ${tst}, ${tst}, ${number}, ${`Ticket ${number}`}, ${status}, ${epicId}, ${milestoneId}, ${number}, ${at}, ${at})`);

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES ('Test', 'human', ${at}, ${at})`,
	);
	await db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${tst}, ${tst}, 'TST', 'tst', 'Test', ${at}, ${at})`);
	const status = ulid();
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${status}, ${tst}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO epics (id, project_id, root_id, slug, name, description, actor_name, actor_kind, created_at, updated_at)
		VALUES (${epic}, ${tst}, ${tst}, 'plan', 'Plan', '', 'Test', 'human', ${at}, ${at})`);
	await db.execute(sql`INSERT INTO milestones (id, epic_id, root_id, slug, name, position, created_at, updated_at)
		VALUES (${milestone}, ${epic}, ${tst}, 'phase-1', 'Phase 1', 0, ${at}, ${at})`);
	await insertTicket(1, status, epic, milestone);
	await insertTicket(2, status, null, null);
	await insertTicket(3, status, epic, null);
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

test("milestone=<ref> keeps the tickets of that milestone, by its three segments or by ULID", async () => {
	expect(await identifiers({ milestone: "tst/PLAN/Phase-1" })).toEqual(["TST-1"]);
	expect(await identifiers({ milestone })).toEqual(["TST-1"]);
});

test("milestone=none keeps the tickets outside every milestone", async () => {
	expect(await identifiers({ milestone: "none" })).toEqual(["TST-2", "TST-3"]);
	expect(await identifiers({ milestone: "none", epic: "TST/plan" })).toEqual(["TST-3"]);
});

test("a row carries the milestone link, and a ticket outside every milestone carries null", async () => {
	const page = await db.transaction((tx) => list(ctx, tx, { project: "TST", sort: "number" }));
	expect(page.items.map((item) => item.milestone)).toEqual([
		{ id: milestone, ref: "TST/plan/phase-1", name: "Phase 1" },
		null,
		null,
	]);
});

test("a milestone ref that names no milestone is NOT_FOUND", async () => {
	await expect(identifiers({ milestone: "TST/plan/missing" })).rejects.toMatchObject({
		code: "NOT_FOUND",
		data: { kind: "milestone", ref: "TST/plan/missing" },
	});
});

test("the database refuses a ticket with a milestone and no epic", async () => {
	await expect(
		db.execute(sql`UPDATE tickets SET epic_id = NULL WHERE root_id = ${tst} AND number = 1`),
	).rejects.toThrow("tickets_milestone_needs_epic");
});
