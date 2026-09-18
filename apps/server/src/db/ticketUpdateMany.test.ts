import { afterAll, beforeAll, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import * as epics from "../services/epics/epics.ts";
import * as labels from "../services/labels.ts";
import * as tickets from "../services/tickets.ts";
import { createCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { type Tx, withTx } from "./tx.ts";

// `tickets.updateMany` and `tickets.deleteMany`: one batch id for the whole
// call, one event for each ticket the write changed, and a refusal that rolls
// every ticket of the call back.

const at = new Date("2026-09-18T12:00:00.000Z");
const rootId = "01J00000000000000000000030";
const todoId = "01J00000000000000000000031";
const doneId = "01J00000000000000000000032";

let db: Db;
let cache: ReturnType<typeof createCache>;
let emitted: TrellisEvent[] = [];

const ctxOf = (emit: (event: TrellisEvent) => void): ServiceCtx => ({
	actor: { name: "test", kind: "human" },
	session: null,
	reqId: "01J00000000000000000000001",
	now: at,
	emit,
	cache,
	actorCache: new Map(),
	dropBlobs: () => undefined,
	publicUrl: "http://127.0.0.1:4521",
});

const run = async <T>(call: (ctx: ServiceCtx, tx: Tx) => Promise<T>) => {
	const { result, events } = await withTx(db, (tx, emit) => call(ctxOf(emit), tx));
	emitted = events;
	return result;
};

const ticketRows = async (identifiers: string[]) => {
	const found = await db.execute(
		sql`SELECT 'TUM-' || t.number AS identifier, t.version, t.status_id, t.epic_id
			FROM tickets t WHERE t.root_id = ${rootId} ORDER BY t.number`,
	);
	return (found.rows as { identifier: string; version: number; status_id: string; epic_id: string | null }[]).filter(
		(row) => identifiers.includes(row.identifier),
	);
};

const updatedEvents = () => emitted.filter((event) => event.type === "ticket.updated");

// Three tickets for the batch test, two more for the delete test.
const seedTicket = (title: string) => run((ctx, tx) => tickets.create(ctx, tx, { project: "TUM", title }));

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(sql`
		INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'TUM', 'tum', 'Update many', ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${todoId}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at}),
			(${doneId}, ${rootId}, 'Done', 'done', 'done', 'fg-muted', 1, false, ${at}, ${at})
	`);
	cache = createCache();
	await withTx(db, (tx) => cache.rebuild(tx));
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TUM", name: "bug" }));
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TUM", name: "chore" }));
	await run((ctx, tx) => epics.create(ctx, tx, { project: "TUM", name: "Bulk" }));
	await seedTicket("First");
	await seedTicket("Second");
	await seedTicket("Third");
	await seedTicket("Fourth");
	await seedTicket("Fifth");
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("one call changes the status, the epic, and the labels of three tickets under one batch id", async () => {
	const { items } = await run((ctx, tx) =>
		tickets.updateMany(ctx, tx, {
			tickets: ["TUM-1", "TUM-2", "TUM-3"],
			status: "done",
			epic: "TUM/bulk",
			addLabels: ["bug"],
		}),
	);

	expect(items.map((item) => item.identifier)).toEqual(["TUM-1", "TUM-2", "TUM-3"]);
	expect(items.map((item) => item.status.slug)).toEqual(["done", "done", "done"]);
	expect(items.map((item) => item.epic?.ref)).toEqual(["TUM/bulk", "TUM/bulk", "TUM/bulk"]);
	expect(items.map((item) => item.labels.map((label) => label.name))).toEqual([["bug"], ["bug"], ["bug"]]);
	expect((await ticketRows(["TUM-1", "TUM-2", "TUM-3"])).map((row) => row.version)).toEqual([2, 2, 2]);

	// One ticket.updated for each ticket, and every event of the call carries
	// the same batch id.
	const events = updatedEvents();
	expect(events.map((event) => (event.type === "ticket.updated" ? event.summary.identifier : ""))).toEqual([
		"TUM-1",
		"TUM-2",
		"TUM-3",
	]);
	for (const event of events) {
		expect(event.type === "ticket.updated" && [...event.fields].sort()).toEqual(["epic", "labels", "status"]);
	}
	const batchIds = new Set(events.map((event) => (event.type === "ticket.updated" ? event.batchId : "")));
	expect(batchIds.size).toBe(1);

	// One activity row for each changed field of each ticket: three fields on
	// three tickets is nine rows, all under the one batch id.
	const written = await db.execute(
		sql`SELECT field, count(*)::int AS n FROM activity
			WHERE batch_id = ${[...batchIds][0] as string} GROUP BY field ORDER BY field`,
	);
	expect(written.rows).toEqual([
		{ field: "epic", n: 3 },
		{ field: "labels", n: 3 },
		{ field: "status", n: 3 },
	]);
});

test("a ref that names no ticket rolls the whole batch back", async () => {
	emitted = [];
	await expect(
		run((ctx, tx) =>
			tickets.updateMany(ctx, tx, { tickets: ["TUM-4", "TUM-900"], status: "done", addLabels: ["chore"] }),
		),
	).rejects.toMatchObject({ code: "NOT_FOUND", data: { kind: "ticket", ref: "TUM-900" } });

	// TUM-4 sits before the refused ref in the list, and it keeps the status,
	// the version, and the labels it had before the call.
	const [row] = await ticketRows(["TUM-4"]);
	expect(row).toMatchObject({ version: 1, status_id: todoId });
	const held = await db.execute(
		sql`SELECT count(*)::int AS n FROM ticket_labels tl JOIN tickets t ON t.id = tl.ticket_id
			WHERE t.root_id = ${rootId} AND t.number = 4`,
	);
	expect(held.rows).toEqual([{ n: 0 }]);
	expect(updatedEvents()).toEqual([]);
});

test("two refs that name one ticket are an input error", async () => {
	await expect(
		run((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: ["TUM-1", "tum-1"], priority: "high" })),
	).rejects.toThrow("Name each ticket once.");
	const [row] = await ticketRows(["TUM-1"]);
	expect(row?.version).toBe(2);
});

test("a batch of more than 200 refs is an input error", async () => {
	const refs = Array.from({ length: 201 }, (_, index) => `TUM-${index + 1}`);
	await expect(run((ctx, tx) => tickets.updateMany(ctx, tx, { tickets: refs, priority: "high" }))).rejects.toThrow(
		/200/,
	);
});

test("deleteMany removes every named ticket under one batch id", async () => {
	emitted = [];
	const { deleted } = await run((ctx, tx) => tickets.deleteMany(ctx, tx, { tickets: ["TUM-4", "TUM-5"] }));

	expect(deleted).toEqual(["TUM-4", "TUM-5"]);
	expect(await ticketRows(["TUM-4", "TUM-5"])).toEqual([]);
	const events = emitted.filter((event) => event.type === "ticket.deleted");
	expect(events.map((event) => (event.type === "ticket.deleted" ? event.summary.identifier : ""))).toEqual([
		"TUM-4",
		"TUM-5",
	]);
	const batchIds = new Set(events.map((event) => (event.type === "ticket.deleted" ? event.batchId : "")));
	expect(batchIds.size).toBe(1);
	const written = await db.execute(
		sql`SELECT count(*)::int AS n FROM activity WHERE batch_id = ${[...batchIds][0] as string} AND action = 'ticket.deleted'`,
	);
	expect(written.rows).toEqual([{ n: 2 }]);
});
