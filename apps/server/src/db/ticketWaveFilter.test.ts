import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { list } from "../services/tickets/read.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";

// One root TST with one status, one epic `TST/plan` with the wave
// `TST/plan/phase-1`, and three tickets: TST-1 in the wave, TST-2
// outside every epic, and TST-3 in the epic with no wave.
let db: Db;
let cache: ProjectCache;
let ctx: ServiceCtx;
const tst = ulid();
const epic = ulid();
const wave = ulid();
const at = "2026-09-18T10:00:00.000Z";

const insertTicket = (number: number, status: string, epicId: string | null, waveId: string | null) =>
	db.execute(sql`INSERT INTO tickets (id, project_id, root_id, number, title, status_id, epic_id, wave_id, position, created_at, updated_at)
		VALUES (${ulid()}, ${tst}, ${tst}, ${number}, ${`Ticket ${number}`}, ${status}, ${epicId}, ${waveId}, ${number}, ${at}, ${at})`);

beforeAll(async () => {
	db = await openTestDb();
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
	await db.execute(sql`INSERT INTO waves (id, epic_id, root_id, slug, name, position, created_at, updated_at)
		VALUES (${wave}, ${epic}, ${tst}, 'phase-1', 'Phase 1', 0, ${at}, ${at})`);
	await insertTicket(1, status, epic, wave);
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

test("wave=<ref> keeps the tickets of that wave, by its three segments or by ULID", async () => {
	expect(await identifiers({ wave: "tst/PLAN/Phase-1" })).toEqual(["TST-1"]);
	expect(await identifiers({ wave })).toEqual(["TST-1"]);
});

test("wave=none keeps the tickets outside every wave", async () => {
	expect(await identifiers({ wave: "none" })).toEqual(["TST-2", "TST-3"]);
	expect(await identifiers({ wave: "none", epic: "TST/plan" })).toEqual(["TST-3"]);
});

test("a row carries the wave link, and a ticket outside every wave carries null", async () => {
	const page = await db.transaction((tx) => list(ctx, tx, { project: "TST", sort: "number" }));
	expect(page.items.map((item) => item.wave)).toEqual([
		{ id: wave, ref: "TST/plan/phase-1", name: "Phase 1" },
		null,
		null,
	]);
});

test("a wave ref that names no wave is NOT_FOUND", async () => {
	await expect(identifiers({ wave: "TST/plan/missing" })).rejects.toMatchObject({
		code: "NOT_FOUND",
		data: { kind: "wave", ref: "TST/plan/missing" },
	});
});

test("the database refuses a ticket with a wave and no epic", async () => {
	await expect(
		db.execute(sql`UPDATE tickets SET epic_id = NULL WHERE root_id = ${tst} AND number = 1`),
	).rejects.toThrow("tickets_wave_needs_epic");
});
