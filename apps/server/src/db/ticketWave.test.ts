import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { get as getBrief } from "../services/brief.ts";
import { create as createEpic, get as getEpic, remove as removeEpic } from "../services/epics/epics.ts";
import { create as createTicket } from "../services/tickets/create.ts";
import { updateMany, update as updateTicket } from "../services/tickets/update.ts";
import { create } from "../services/waves/waves.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import type { Tx } from "./tx.ts";

// One root TST with a todo and a done status, and a second root OTH. The
// epic TST/plan holds the waves phase-3, phase-1-run-state, and phase-2
// in that order, and TST/other is a second epic of the same root. The
// services run against an in-memory database with a fixed clock.
let db: Db;
let cache: ProjectCache;
const tst = ulid();
const oth = ulid();
const events: TrellisEvent[] = [];
const human: ActorRef = { name: "Test", kind: "human" };

const insertProject = (id: string, key: string) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);

const insertStatus = (root: string, name: string, slug: string, category: string, position: number) =>
	db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, reviewer, color, position, is_default, created_at, updated_at)
		VALUES (${ulid()}, ${root}, ${name}, ${slug}, ${category}, NULL, 'fg-muted', ${position}, ${position === 0}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);

// A core service context at `now`. `emit` collects the events of the call.
const ctxAt = (now: string, actor: ActorRef = human): ServiceCtx => ({
	actor,
	session: null,
	reqId: ulid(),
	now: new Date(now),
	cache,
	actorCache: new Map(),
	emit: (event) => {
		events.push(event);
	},
	dropBlobs: () => {},
	publicUrl: "http://localhost:4597",
});

const run = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

// The epic slug and the wave slug of each ticket of TST, in number order.
const placements = async () => {
	const found = await db.execute(
		sql`SELECT 'TST-' || t.number AS identifier, e.slug AS epic, m.slug AS wave
			FROM tickets t LEFT JOIN epics e ON e.id = t.epic_id LEFT JOIN waves m ON m.id = t.wave_id
			WHERE t.project_id = ${tst} ORDER BY t.number`,
	);
	return found.rows;
};

let planId: string;

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await insertProject(tst, "TST");
	await insertProject(oth, "OTH");
	await insertStatus(tst, "Todo", "todo", "todo", 0);
	await insertStatus(tst, "Done", "done", "done", 1);
	await insertStatus(oth, "Todo", "todo", "todo", 0);
	cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
	const ctx = ctxAt("2026-09-18T10:00:30.000Z");
	planId = (await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Plan" }))).id;
	await run((tx) => createEpic(ctx, tx, { project: "TST", name: "Other" }));
	await run((tx) => createEpic(ctx, tx, { project: "OTH", name: "Plan" }));
	await run((tx) => create(ctx, tx, { epic: "TST/plan", name: "Phase 3" }));
	await run((tx) => create(ctx, tx, { epic: "TST/plan", name: "Phase 1: run state" }));
	await run((tx) => create(ctx, tx, { epic: "TST/plan", name: "Phase 2" }));
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("a wave places the ticket in the epic of that wave in the same write", async () => {
	const ctx = ctxAt("2026-09-18T10:04:00.000Z");
	events.length = 0;
	const created = await run((tx) =>
		createTicket(ctx, tx, { project: "TST", title: "Step 1", wave: "tst/plan/PHASE-2" }),
	);
	expect(created.epic).toEqual({ id: planId, ref: "TST/plan", name: "Plan" });
	expect(created.wave).toEqual({ id: expect.any(String), ref: "TST/plan/phase-2", name: "Phase 2" });
	expect(events[0]).toMatchObject({
		type: "ticket.created",
		fields: ["title", "description", "priority", "status", "project", "epic", "wave"],
	});

	await run((tx) => createTicket(ctx, tx, { project: "TST", title: "Step 2", status: "done" }));
	events.length = 0;
	const placed = await run((tx) => updateTicket(ctx, tx, { ticket: "TST-2", wave: "TST/plan/phase-2" }));
	expect(placed.epic?.ref).toBe("TST/plan");
	expect(placed.wave?.ref).toBe("TST/plan/phase-2");
	expect(events[0]).toMatchObject({ type: "ticket.updated", fields: ["epic", "wave"] });
	const activity = await db.execute(
		sql`SELECT field, from_value, to_value FROM activity WHERE ticket_id = ${placed.id} AND field IN ('epic', 'wave') ORDER BY id`,
	);
	expect(activity.rows).toEqual([
		{ field: "epic", from_value: null, to_value: "TST/plan" },
		{ field: "wave", from_value: null, to_value: "TST/plan/phase-2" },
	]);

	const epic = await run((tx) => getEpic(ctx, tx, { epic: "TST/plan" }));
	const phase2 = epic.waves.find((wave) => wave.slug === "phase-2");
	expect(phase2?.counts).toEqual({ total: 2, todo: 1, started: 0, review: 0, done: 1, canceled: 0 });
	expect(phase2?.state).toBe("open");
	await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", status: "done" }));
	const done = await run((tx) => getEpic(ctx, tx, { epic: "TST/plan" }));
	expect(done.waves.find((wave) => wave.slug === "phase-2")?.state).toBe("done");
});

test("the brief names the wave and groups the epic tickets by wave", async () => {
	const ctx = ctxAt("2026-09-18T10:04:30.000Z");
	const brief = await run((tx) => getBrief(ctx, tx, { ticket: "TST-1" }));
	expect(brief.markdown).toContain(
		"- Epic: Plan (TST/plan), 2 of 2 done\n- Wave: Phase 2 (TST/plan/phase-2), 2 of 2 done\n",
	);
	expect(brief.markdown).toContain(
		[
			"## Epic tickets",
			"",
			"### Phase 3",
			"",
			"### Phase 1: run state",
			"",
			"### Phase 2",
			"",
			"- TST-1 Step 1 (Done) (this ticket)",
			"- TST-2 Step 2 (Done)",
			"",
			"## ",
		].join("\n"),
	);
});

test("an epic beside a wave must be the epic of that wave", async () => {
	const ctx = ctxAt("2026-09-18T10:05:00.000Z");
	await expect(
		run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: "TST/other", wave: "TST/plan/phase-2" })),
	).rejects.toMatchObject({ code: "WAVE_OUTSIDE_EPIC" });
	await expect(
		run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: null, wave: "TST/plan/phase-2" })),
	).rejects.toMatchObject({ code: "WAVE_OUTSIDE_EPIC" });
	await expect(
		run((tx) => createTicket(ctx, tx, { project: "TST", title: "Stray", epic: "TST/other", wave: "TST/plan/phase-2" })),
	).rejects.toMatchObject({ code: "WAVE_OUTSIDE_EPIC" });
	await expect(
		run((tx) => createTicket(ctx, tx, { project: "OTH", title: "Stray", wave: "TST/plan/phase-2" })),
	).rejects.toMatchObject({ code: "CROSS_PROJECT_LINK" });
	const same = await run((tx) =>
		updateTicket(ctx, tx, { ticket: "TST-1", epic: "TST/plan", wave: "TST/plan/phase-3" }),
	);
	expect(same.wave?.ref).toBe("TST/plan/phase-3");
});

test("an epic change or an epic clear sets the wave NULL, and the same epic keeps it", async () => {
	const ctx = ctxAt("2026-09-18T10:06:00.000Z");
	const kept = await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: "TST/plan" }));
	expect(kept.wave?.ref).toBe("TST/plan/phase-3");

	events.length = 0;
	const moved = await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: "TST/other" }));
	expect(moved.epic?.ref).toBe("TST/other");
	expect(moved.wave).toBeNull();
	expect(events[0]).toMatchObject({ type: "ticket.updated", fields: ["epic", "wave"] });
	const activity = await db.execute(
		sql`SELECT from_value, to_value FROM activity WHERE ticket_id = ${moved.id} AND field = 'wave' ORDER BY id DESC LIMIT 1`,
	);
	expect(activity.rows).toEqual([{ from_value: "TST/plan/phase-3", to_value: null }]);

	const many = await run((tx) => updateMany(ctx, tx, { tickets: ["TST-1", "TST-2"], epic: null }));
	expect(many.items.map((item) => [item.identifier, item.epic, item.wave])).toEqual([
		["TST-1", null, null],
		["TST-2", null, null],
	]);
	const back = await run((tx) => updateMany(ctx, tx, { tickets: ["TST-1", "TST-2"], wave: "TST/plan/phase-2" }));
	expect(back.items.map((item) => [item.epic?.ref, item.wave?.ref])).toEqual([
		["TST/plan", "TST/plan/phase-2"],
		["TST/plan", "TST/plan/phase-2"],
	]);
	const cleared = await run((tx) => updateTicket(ctx, tx, { ticket: "TST-2", wave: null }));
	expect(cleared.epic?.ref).toBe("TST/plan");
	expect(cleared.wave).toBeNull();
	await run((tx) => updateTicket(ctx, tx, { ticket: "TST-2", wave: "TST/plan/phase-2" }));
});

test("an epic delete detaches a ticket that holds a wave of the epic", async () => {
	const ctx = ctxAt("2026-09-18T10:08:00.000Z");
	await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", wave: "TST/plan/phase-3" }));
	await run((tx) => updateTicket(ctx, tx, { ticket: "TST-2", wave: null }));
	events.length = 0;
	await run((tx) => removeEpic(ctx, tx, { epic: "TST/plan" }));
	expect(await placements()).toEqual([
		{ identifier: "TST-1", epic: null, wave: null },
		{ identifier: "TST-2", epic: null, wave: null },
	]);
	const left = await db.execute(sql`SELECT count(*)::int AS n FROM waves WHERE epic_id = ${planId}`);
	expect(left.rows).toEqual([{ n: 0 }]);
	expect(
		events.flatMap((event) => (event.type === "ticket.updated" ? [[event.summary.identifier, event.fields]] : [])),
	).toEqual([
		["TST-1", ["epic", "wave"]],
		["TST-2", ["epic"]],
	]);
});
