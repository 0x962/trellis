import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ActorRef, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { create, get, list, remove, update } from "../services/epics/epics.ts";
import { create as createTicket } from "../services/tickets/create.ts";
import { update as updateTicket } from "../services/tickets/update.ts";
import { createCache, type ProjectCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";
import type { Tx } from "./tx.ts";

// One root TST with the five seeded categories, and a second root OTH. The
// epic services run against an in-memory database with a fixed clock, so
// every timestamp of one call is the instant of its context.
let db: Db;
let cache: ProjectCache;
const tst = ulid();
const oth = ulid();
const statuses: Record<string, string> = {};
const events: TrellisEvent[] = [];
const human: ActorRef = { name: "Test", kind: "human" };
const agent: ActorRef = { name: "01J00000000000000000000000", kind: "agent" };

const insertProject = (id: string, key: string) =>
	db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
		VALUES (${id}, ${key}, ${key.toLowerCase()}, ${key}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);

const insertStatus = async (root: string, name: string, slug: string, category: string, position: number) => {
	const id = ulid();
	await db.execute(sql`INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${id}, ${root}, ${name}, ${slug}, ${category}, 'fg-muted', ${position}, ${position === 0}, '2026-09-18T10:00:00.000Z', '2026-09-18T10:00:00.000Z')`);
	return id;
};

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

beforeAll(async () => {
	db = await openTestDb();
	await insertProject(tst, "TST");
	await insertProject(oth, "OTH");
	statuses.todo = await insertStatus(tst, "Todo", "todo", "todo", 0);
	statuses.started = await insertStatus(tst, "In Progress", "in-progress", "started", 1);
	statuses.review = await insertStatus(tst, "Agent Review", "agent-review", "review", 2);
	statuses.done = await insertStatus(tst, "Done", "done", "done", 3);
	statuses.canceled = await insertStatus(tst, "Canceled", "canceled", "canceled", 4);
	await insertStatus(oth, "Todo", "todo", "todo", 0);
	cache = createCache();
	await db.transaction((tx) => cache.rebuild(tx));
}, 30_000);

afterAll(async () => {
	await db.$client.close();
});

test("create derives the slug from the name and suffixes a taken derived slug", async () => {
	const ctx = ctxAt("2026-09-18T10:01:00.000Z");
	const first = await run((tx) => create(ctx, tx, { project: "TST", name: "Routine Runtime!" }));
	expect(first).toMatchObject({
		slug: "routine-runtime",
		ref: "TST/routine-runtime",
		projectKey: "TST",
		state: "open",
		counts: { total: 0, todo: 0, started: 0, review: 0, done: 0, canceled: 0 },
		tickets: [],
		actor: { name: "Test", kind: "human" },
	});
	const second = await run((tx) => create(ctx, tx, { project: "TST", name: "Routine runtime" }));
	expect(second.slug).toBe("routine-runtime-2");
	const third = await run((tx) => create(ctx, tx, { project: "TST", name: "Routine runtime" }));
	expect(third.slug).toBe("routine-runtime-3");
	expect(events.filter((event) => event.type === "epics.changed")).toHaveLength(3);
});

test("a given slug that another epic of the root holds is DUPLICATE", async () => {
	const ctx = ctxAt("2026-09-18T10:02:00.000Z");
	await expect(
		run((tx) => create(ctx, tx, { project: "TST", name: "Another", slug: "routine-runtime" })),
	).rejects.toMatchObject({ code: "DUPLICATE", data: { field: "slug" } });
	const other = await run((tx) => create(ctx, tx, { project: "OTH", name: "Other", slug: "routine-runtime" }));
	expect(other.ref).toBe("OTH/routine-runtime");
	await expect(
		run((tx) => update(ctx, tx, { epic: "TST/routine-runtime-3", slug: "routine-runtime-2" })),
	).rejects.toMatchObject({ code: "DUPLICATE", data: { field: "slug" } });
});

test("get derives the counts and the state from the tickets of the epic", async () => {
	const ctx = ctxAt("2026-09-18T10:03:00.000Z");
	const todo = await run((tx) =>
		createTicket(ctx, tx, { project: "TST", title: "Step 1", epic: "tst/ROUTINE-RUNTIME" }),
	);
	await run((tx) =>
		createTicket(ctx, tx, { project: "TST", title: "Step 2", epic: "TST/routine-runtime", status: "done" }),
	);
	await run((tx) =>
		createTicket(ctx, tx, { project: "TST", title: "Step 3", epic: "TST/routine-runtime", status: "canceled" }),
	);
	expect(todo.epic).toEqual({ id: expect.any(String), ref: "TST/routine-runtime", name: "Routine Runtime!" });
	const open = await run((tx) => get(ctx, tx, { epic: "TST/routine-runtime" }));
	expect(open.counts).toEqual({ total: 3, todo: 1, started: 0, review: 0, done: 1, canceled: 1 });
	expect(open.state).toBe("open");
	expect(open.tickets.map((ticket) => ticket.identifier)).toEqual(["TST-1", "TST-2", "TST-3"]);

	await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", status: "done" }));
	const done = await run((tx) => get(ctx, tx, { epic: open.id }));
	expect(done.counts).toEqual({ total: 3, todo: 0, started: 0, review: 0, done: 2, canceled: 1 });
	expect(done.state).toBe("done");
});

test("a ticket cannot join an epic of another root", async () => {
	const ctx = ctxAt("2026-09-18T10:04:00.000Z");
	await expect(
		run((tx) => createTicket(ctx, tx, { project: "TST", title: "Stray", epic: "OTH/routine-runtime" })),
	).rejects.toMatchObject({ code: "CROSS_PROJECT_LINK" });
	await expect(
		run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: "OTH/routine-runtime" })),
	).rejects.toMatchObject({ code: "CROSS_PROJECT_LINK" });
});

test("a ticket epic change records the field epic with both refs", async () => {
	const ctx = ctxAt("2026-09-18T10:05:00.000Z");
	events.length = 0;
	const moved = await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: "TST/routine-runtime-2" }));
	expect(moved.epic?.ref).toBe("TST/routine-runtime-2");
	const activity = await db.execute(
		sql`SELECT field, from_value, to_value FROM activity WHERE ticket_id = ${moved.id} AND field = 'epic' ORDER BY id DESC LIMIT 1`,
	);
	expect(activity.rows).toEqual([
		{ field: "epic", from_value: "TST/routine-runtime", to_value: "TST/routine-runtime-2" },
	]);
	const event = events.find((item) => item.type === "ticket.updated");
	expect(event).toMatchObject({ type: "ticket.updated", fields: ["epic", "wave"] });
	const cleared = await run((tx) => updateTicket(ctx, tx, { ticket: "TST-1", epic: null }));
	expect(cleared.epic).toBeNull();
});

test("list puts open epics before done epics and the latest change first inside a group", async () => {
	const later = ctxAt("2026-09-18T10:06:00.000Z");
	await run((tx) => update(later, tx, { epic: "TST/routine-runtime-3", name: "Third, renamed" }));
	const found = await run((tx) => list(later, tx, { project: "TST" }));
	expect(found.map((epic) => [epic.slug, epic.state])).toEqual([
		["routine-runtime-3", "open"],
		["routine-runtime-2", "open"],
		["routine-runtime", "done"],
	]);
	expect(found[0]?.name).toBe("Third, renamed");
	expect(found[0]?.actor).toEqual({ name: "Test", kind: "human" });
});

test("delete needs force for an agent, then detaches every ticket with activity and events", async () => {
	const asAgent = ctxAt("2026-09-18T10:07:00.000Z", agent);
	await expect(run((tx) => remove(asAgent, tx, { epic: "TST/routine-runtime" }))).rejects.toMatchObject({
		code: "AGENT_CANNOT_DELETE",
	});
	events.length = 0;
	const removed = await run((tx) => remove(asAgent, tx, { epic: "TST/routine-runtime", force: true }));
	const detached = await db.execute(
		sql`SELECT 'TST-' || number AS identifier, epic_id FROM tickets WHERE project_id = ${tst} ORDER BY number`,
	);
	expect(detached.rows).toEqual([
		{ identifier: "TST-1", epic_id: null },
		{ identifier: "TST-2", epic_id: null },
		{ identifier: "TST-3", epic_id: null },
	]);
	const activity = await db.execute(
		sql`SELECT from_value, to_value, count(*)::int AS n FROM activity
			WHERE field = 'epic' AND meta->>'fromId' = ${removed.id} AND to_value IS NULL GROUP BY from_value, to_value`,
	);
	expect(activity.rows).toEqual([{ from_value: "TST/routine-runtime", to_value: null, n: 2 }]);
	const updated = events.filter((event) => event.type === "ticket.updated");
	expect(updated.map((event) => (event.type === "ticket.updated" ? event.summary.identifier : ""))).toEqual([
		"TST-2",
		"TST-3",
	]);
	expect(events.at(-1)).toEqual({ type: "epics.changed", projectId: tst, id: removed.id });
	await expect(run((tx) => get(asAgent, tx, { epic: "TST/routine-runtime" }))).rejects.toMatchObject({
		code: "NOT_FOUND",
		data: { kind: "epic", ref: "TST/routine-runtime" },
	});
});
