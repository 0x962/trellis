import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { create as createEpic, get as getEpic } from "../services/epics/epics.ts";
import { create, remove, reorder, update } from "../services/milestones/milestones.ts";
import { create as createTicket } from "../services/tickets/create.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import type { Tx } from "./tx.ts";

// One root TST with a todo and a done status. The epic TST/plan holds the
// milestones of the tests, and TST/other is a second epic of the same root.
// The services run against an in-memory database with a fixed clock.
let db: Db;
let cache: ProjectCache;
const tst = ulid();
const oth = ulid();
const events: TrellisEvent[] = [];
const human: ActorRef = { name: "Test", kind: "human" };
const agent: ActorRef = { name: "01J00000000000000000000000", kind: "agent" };

const insertProject = (id: string, key: string) =>
	db.execute(sql`INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${id}, ${key}, ${key.toLowerCase()}, ${key}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);

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

// The epic slug and the milestone slug of each ticket of TST, in number order.
const placements = async () => {
	const found = await db.execute(
		sql`SELECT 'TST-' || t.number AS identifier, e.slug AS epic, m.slug AS milestone
			FROM tickets t LEFT JOIN epics e ON e.id = t.epic_id LEFT JOIN milestones m ON m.id = t.milestone_id
			WHERE t.root_id = ${tst} ORDER BY t.number`,
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
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("create appends the milestone, derives the slug, and suffixes a taken derived slug", async () => {
	const ctx = ctxAt("2026-09-18T10:01:00.000Z");
	events.length = 0;
	const first = await run((tx) => create(ctx, tx, { epic: "tst/PLAN", name: "Phase 1: run state" }));
	expect(first).toMatchObject({
		epicId: planId,
		ref: "TST/plan/phase-1-run-state",
		slug: "phase-1-run-state",
		name: "Phase 1: run state",
		position: 0,
		state: "open",
		counts: { total: 0, todo: 0, started: 0, review: 0, done: 0, canceled: 0 },
	});
	const second = await run((tx) => create(ctx, tx, { epic: "TST/plan", name: "Phase 2", slug: "phase-2" }));
	expect(second.position).toBe(1);
	const third = await run((tx) => create(ctx, tx, { epic: planId, name: "Phase 2" }));
	expect(third).toMatchObject({ slug: "phase-2-2", position: 2 });
	expect(events).toEqual([
		{ type: "epics.changed", projectId: tst, id: planId },
		{ type: "epics.changed", projectId: tst, id: planId },
		{ type: "epics.changed", projectId: tst, id: planId },
	]);
});

test("a given slug that another milestone of the epic holds is DUPLICATE", async () => {
	const ctx = ctxAt("2026-09-18T10:02:00.000Z");
	await expect(
		run((tx) => create(ctx, tx, { epic: "TST/plan", name: "Again", slug: "phase-2" })),
	).rejects.toMatchObject({ code: "DUPLICATE", data: { field: "slug" } });
	await expect(
		run((tx) => update(ctx, tx, { milestone: "TST/plan/phase-2-2", slug: "phase-2" })),
	).rejects.toMatchObject({ code: "DUPLICATE", data: { field: "slug" } });
	const other = await run((tx) => create(ctx, tx, { epic: "TST/other", name: "Phase 2" }));
	expect(other.ref).toBe("TST/other/phase-2");
	const renamed = await run((tx) =>
		update(ctx, tx, { milestone: "tst/plan/PHASE-2-2", name: "Phase 3", slug: "phase-3" }),
	);
	expect(renamed).toMatchObject({ ref: "TST/plan/phase-3", name: "Phase 3", position: 2 });
});

test("reorder takes the full list of the epic and writes the positions from 0", async () => {
	const ctx = ctxAt("2026-09-18T10:03:00.000Z");
	await expect(
		run((tx) => reorder(ctx, tx, { epic: "TST/plan", milestones: ["TST/plan/phase-3", "TST/plan/phase-2"] })),
	).rejects.toMatchObject({ code: "MILESTONE_OUTSIDE_EPIC" });
	await expect(
		run((tx) =>
			reorder(ctx, tx, {
				epic: "TST/plan",
				milestones: ["TST/plan/phase-3", "TST/plan/phase-2", "TST/other/phase-2"],
			}),
		),
	).rejects.toMatchObject({ code: "MILESTONE_OUTSIDE_EPIC" });
	await expect(
		run((tx) =>
			reorder(ctx, tx, {
				epic: "TST/plan",
				milestones: ["TST/plan/phase-3", "TST/plan/phase-3", "TST/plan/phase-2"],
			}),
		),
	).rejects.toMatchObject({ code: "MILESTONE_OUTSIDE_EPIC" });
	const ordered = await run((tx) =>
		reorder(ctx, tx, {
			epic: "TST/plan",
			milestones: ["TST/plan/phase-3", "TST/plan/phase-1-run-state", "TST/plan/phase-2"],
		}),
	);
	expect(ordered.map((milestone) => [milestone.slug, milestone.position])).toEqual([
		["phase-3", 0],
		["phase-1-run-state", 1],
		["phase-2", 2],
	]);
	const epic = await run((tx) => getEpic(ctx, tx, { epic: "TST/plan" }));
	expect(epic.milestones.map((milestone) => milestone.slug)).toEqual(["phase-3", "phase-1-run-state", "phase-2"]);
});

test("delete needs force for an agent, then detaches every ticket with activity and events", async () => {
	const asAgent = ctxAt("2026-09-18T10:07:00.000Z", agent);
	await expect(run((tx) => remove(asAgent, tx, { milestone: "TST/plan/phase-2" }))).rejects.toMatchObject({
		code: "AGENT_CANNOT_DELETE",
	});
	const ctx = ctxAt("2026-09-18T10:06:00.000Z");
	await run((tx) => createTicket(ctx, tx, { project: "TST", title: "Step 1", milestone: "TST/plan/phase-2" }));
	await run((tx) => createTicket(ctx, tx, { project: "TST", title: "Step 2", milestone: "TST/plan/phase-2" }));
	const before = await db.execute(sql`SELECT number, version FROM tickets WHERE root_id = ${tst} ORDER BY number`);
	events.length = 0;
	const removed = await run((tx) => remove(asAgent, tx, { milestone: "TST/plan/phase-2", force: true }));
	expect(await placements()).toEqual([
		{ identifier: "TST-1", epic: "plan", milestone: null },
		{ identifier: "TST-2", epic: "plan", milestone: null },
	]);
	const after = await db.execute(sql`SELECT number, version FROM tickets WHERE root_id = ${tst} ORDER BY number`);
	expect(after.rows.map((row) => Number(row.version))).toEqual(before.rows.map((row) => Number(row.version) + 1));
	const activity = await db.execute(
		sql`SELECT from_value, to_value, count(*)::int AS n FROM activity
			WHERE field = 'milestone' AND meta->>'fromId' = ${removed.id} AND created_at = '2026-09-18T10:07:00.000Z'
			GROUP BY from_value, to_value`,
	);
	expect(activity.rows).toEqual([{ from_value: "TST/plan/phase-2", to_value: null, n: 2 }]);
	expect(
		events.map((event) =>
			event.type === "ticket.updated" ? [event.summary.identifier, event.fields, event.summary.milestone] : event,
		),
	).toEqual([
		["TST-1", ["milestone"], null],
		["TST-2", ["milestone"], null],
		{ type: "epics.changed", projectId: tst, id: planId },
	]);
	await expect(run((tx) => update(asAgent, tx, { milestone: "TST/plan/phase-2", name: "Gone" }))).rejects.toMatchObject(
		{
			code: "NOT_FOUND",
			data: { kind: "milestone", ref: "TST/plan/phase-2" },
		},
	);
});
