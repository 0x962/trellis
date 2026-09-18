import { afterAll, beforeAll, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import * as labelGroups from "../services/labelGroups.ts";
import * as labels from "../services/labels.ts";
import * as tickets from "../services/tickets.ts";
import { createCache } from "./cache.ts";
import { type Db, openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { type Tx, withTx } from "./tx.ts";

// The labels of a ticket: the deltas of a write, the one label of a group at
// most, and the three list filters.

const at = new Date("2026-09-18T12:00:00.000Z");
const rootId = "01J00000000000000000000020";
const statusId = "01J00000000000000000000021";

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

const ticketRow = async (id: string) => {
	const found = await db.execute(sql`SELECT version, updated_at FROM tickets WHERE id = ${id}`);
	return found.rows[0] as { version: number; updated_at: Date };
};

beforeAll(async () => {
	db = await openDb(":memory:");
	await migrate(db);
	await db.execute(sql`
		INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'TKL', 'tkl', 'Ticket labels', ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
	`);
	cache = createCache();
	await withTx(db, (tx) => cache.rebuild(tx));
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TKL", name: "bug" }));
	await run((ctx, tx) => labelGroups.create(ctx, tx, { project: "TKL", name: "Type" }));
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TKL", name: "feature", group: "Type" }));
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TKL", name: "chore", group: "Type" }));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("a create takes labels, and the summary lists the label with no group first", async () => {
	const ticket = await run((ctx, tx) =>
		tickets.create(ctx, tx, { project: "TKL", title: "First", labels: ["type/feature", "bug"] }),
	);

	expect(ticket.labels.map((label) => `${label.group ?? ""}/${label.name}`)).toEqual(["/bug", "Type/feature"]);
	expect(ticket.version).toBe(1);
	expect(emitted.some((event) => event.type === "ticket.created")).toBe(true);
});

test("two labels of one group in one write are an input error", async () => {
	await expect(
		run((ctx, tx) => tickets.create(ctx, tx, { project: "TKL", title: "Bad", labels: ["type/feature", "type/chore"] })),
	).rejects.toThrow("A ticket holds one label of the group");
});

test("a label write that changes nothing leaves the version alone", async () => {
	const ticket = await run((ctx, tx) => tickets.create(ctx, tx, { project: "TKL", title: "Second", labels: ["bug"] }));
	const before = await ticketRow(ticket.id);

	await run((ctx, tx) => tickets.update(ctx, tx, { ticket: ticket.identifier, addLabels: ["bug"] }));
	await run((ctx, tx) => tickets.update(ctx, tx, { ticket: ticket.identifier, removeLabels: ["type/feature"] }));

	expect((await ticketRow(ticket.id)).version).toBe(before.version);
});

test("a label is the only change of a write, and the write still raises the version", async () => {
	const ticket = await run((ctx, tx) => tickets.create(ctx, tx, { project: "TKL", title: "Third" }));
	const before = await ticketRow(ticket.id);

	const after = await run((ctx, tx) => tickets.update(ctx, tx, { ticket: ticket.identifier, addLabels: ["bug"] }));

	expect(after.version).toBe(before.version + 1);
	expect(after.labels.map((label) => label.name)).toEqual(["bug"]);
	const event = emitted.find((item) => item.type === "ticket.updated");
	expect(event?.type === "ticket.updated" ? event.fields : []).toEqual(["labels"]);
	const activity = await db.execute(sql`
		SELECT field, from_value, to_value FROM activity
		WHERE ticket_id = ${ticket.id} AND field = 'labels' ORDER BY id`);
	expect(activity.rows).toEqual([{ field: "labels", from_value: null, to_value: "bug" }]);
});

test("a label of a group replaces the label of that group the ticket holds", async () => {
	const ticket = await run((ctx, tx) =>
		tickets.create(ctx, tx, { project: "TKL", title: "Fourth", labels: ["type/feature"] }),
	);

	const after = await run((ctx, tx) =>
		tickets.update(ctx, tx, { ticket: ticket.identifier, addLabels: ["type/chore"] }),
	);

	expect(after.labels.map((label) => label.name)).toEqual(["chore"]);
	const activity = await db.execute(sql`
		SELECT from_value, to_value FROM activity
		WHERE ticket_id = ${ticket.id} AND field = 'labels' ORDER BY id`);
	expect(activity.rows).toEqual([{ from_value: "Type/feature", to_value: "Type/chore" }]);
});

test("the list filters keep the tickets that hold a label, that hold none, and that lack one", async () => {
	const held = await run((ctx, tx) =>
		tickets.create(ctx, tx, { project: "TKL", title: "Filter held", labels: ["type/chore"] }),
	);
	const bare = await run((ctx, tx) => tickets.create(ctx, tx, { project: "TKL", title: "Filter bare" }));

	const withLabel = await run((ctx, tx) => tickets.list(ctx, tx, { project: "TKL", label: "type/chore" }));
	const withNone = await run((ctx, tx) => tickets.list(ctx, tx, { project: "TKL", label: "none" }));
	const both = await run((ctx, tx) => tickets.list(ctx, tx, { project: "TKL", label: "type/chore,none" }));
	const without = await run((ctx, tx) => tickets.list(ctx, tx, { project: "TKL", labelNot: "type/chore" }));

	expect(withLabel.items.map((item) => item.id)).toContain(held.id);
	expect(withNone.items.map((item) => item.id)).toEqual([bare.id]);
	expect(both.items.map((item) => item.id)).toContain(bare.id);
	expect(without.items.map((item) => item.id)).not.toContain(held.id);
	await expect(run((ctx, tx) => tickets.list(ctx, tx, { project: "TKL", label: "nothing" }))).rejects.toThrow();
});

test("a move into a group refuses while a ticket holds two labels of that group", async () => {
	const ticket = await run((ctx, tx) =>
		tickets.create(ctx, tx, { project: "TKL", title: "Fifth", labels: ["bug", "type/feature"] }),
	);
	const list = await run((ctx, tx) => labels.list(ctx, tx, { project: "TKL" }));
	const bug = list.labels.find((label) => label.name === "bug" && label.groupId === null);

	await expect(
		run((ctx, tx) => labels.update(ctx, tx, { project: "TKL", label: bug?.id ?? "", group: "Type" })),
	).rejects.toThrow();

	const deleted = await run((ctx, tx) => labels.delete(ctx, tx, { project: "TKL", label: bug?.id ?? "" }));
	expect(deleted.tickets).toBeGreaterThan(0);
	expect((await ticketRow(ticket.id)).version).toBe(1);
});
