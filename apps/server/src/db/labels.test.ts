import { afterAll, beforeAll, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import * as labelGroups from "../services/labelGroups.ts";
import { resolveLabel } from "../services/labelRefs.ts";
import * as labels from "../services/labels.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { openTestDb } from "./testDb.ts";
import { type Tx, withTx } from "./tx.ts";

// The label services of a project tree. The root project owns the labels, so
// a call from the sub-project `TST.web` reads and writes the labels of `TST`.

const at = new Date("2026-09-18T12:00:00.000Z");
const rootId = "01J00000000000000000000010";
const subId = "01J00000000000000000000011";
const statusId = "01J00000000000000000000012";

let db: Db;
let cache: ReturnType<typeof createCache>;
const events: TrellisEvent[] = [];

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

// One service call in one transaction, with the events it emitted collected.
const run = async <T>(call: (ctx: ServiceCtx, tx: Tx) => Promise<T>) => {
	const { result, events: emitted } = await withTx(db, (tx, emit) => call(ctxOf(emit), tx));
	events.push(...emitted);
	return result;
};

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`
		INSERT INTO projects (id, root_id, key, slug, name, created_at, updated_at)
		VALUES (${rootId}, ${rootId}, 'TST', 'tst', 'Test', ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO projects (id, parent_id, root_id, slug, name, position, created_at, updated_at)
		VALUES (${subId}, ${rootId}, ${rootId}, 'web', 'Web', 0, ${at}, ${at})
	`);
	await db.execute(sql`
		INSERT INTO statuses (id, project_id, name, slug, category, color, position, is_default, created_at, updated_at)
		VALUES (${statusId}, ${rootId}, 'Todo', 'todo', 'todo', 'fg-muted', 0, true, ${at}, ${at})
	`);
	cache = createCache();
	await withTx(db, (tx) => cache.rebuild(tx));
}, 60_000);

afterAll(async () => {
	await db.$client.close();
});

test("a create from a sub-project writes the label on the root and takes the first free hue", async () => {
	const bug = await run((ctx, tx) => labels.create(ctx, tx, { project: "TST.web", name: "bug" }));
	const chore = await run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: "chore" }));

	expect(bug.projectId).toBe(rootId);
	expect(bug.groupId).toBeNull();
	expect([bug.color, chore.color]).toEqual(["red", "orange"]);
	expect(bug.ticketCount).toBe(0);
	expect(events.at(-1)).toEqual({ type: "labels.changed", projectId: rootId });
	const activity = await db.execute(
		sql`SELECT action, to_value FROM activity WHERE action = 'label.created' ORDER BY id`,
	);
	expect(activity.rows[0]).toEqual({ action: "label.created", to_value: "bug" });
});

test("a label with no group and a label group of one root cannot share a name", async () => {
	await run((ctx, tx) => labelGroups.create(ctx, tx, { project: "TST", name: "Type" }));

	await expect(run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: "type" }))).rejects.toThrow();
	await expect(run((ctx, tx) => labelGroups.create(ctx, tx, { project: "TST", name: "BUG" }))).rejects.toThrow();
	await expect(run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: "BUG" }))).rejects.toThrow();
});

test("a bare ref answers the label with no group, and two grouped labels of one name are ambiguous", async () => {
	await run((ctx, tx) => labelGroups.create(ctx, tx, { project: "TST", name: "Area" }));
	const typeBug = await run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: "bug", group: "type" }));
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: "bug", group: "Area" }));

	const bare = await withTx(db, (tx) =>
		resolveLabel(
			ctxOf(() => undefined),
			tx,
			{ rootId, ref: "bug" },
		),
	);
	expect(bare.result.group_id).toBeNull();
	const grouped = await withTx(db, (tx) =>
		resolveLabel(
			ctxOf(() => undefined),
			tx,
			{ rootId, ref: "type/bug" },
		),
	);
	expect(grouped.result.id).toBe(typeBug.id);

	const ungrouped = await withTx(db, (tx) =>
		resolveLabel(
			ctxOf(() => undefined),
			tx,
			{ rootId, ref: "bug" },
		),
	);
	await withTx(db, (tx) =>
		labels.delete(
			ctxOf(() => undefined),
			tx,
			{ project: "TST", label: ungrouped.result.id },
		),
	);
	await expect(
		withTx(db, (tx) =>
			resolveLabel(
				ctxOf(() => undefined),
				tx,
				{ rootId, ref: "bug" },
			),
		),
	).rejects.toThrow();
	await expect(
		withTx(db, (tx) =>
			resolveLabel(
				ctxOf(() => undefined),
				tx,
				{ rootId, ref: "nothing" },
			),
		),
	).rejects.toThrow();
});

test("labels.list returns the groups and the labels of the root in name order", async () => {
	const listed = await run((ctx, tx) => labels.list(ctx, tx, { project: "TST.web" }));

	expect(listed.groups.map((group) => group.name)).toEqual(["Area", "Type"]);
	expect(listed.labels.map((label) => label.name)).toEqual(["bug", "bug", "chore"]);
});

test("a group delete ungroups its labels, and a name that is taken refuses the call", async () => {
	await run((ctx, tx) => labels.create(ctx, tx, { project: "TST", name: "chore", group: "Area" }));

	const area = (await run((ctx, tx) => labels.list(ctx, tx, { project: "TST" }))).groups.find(
		(group) => group.name === "Area",
	);
	await expect(
		run((ctx, tx) => labelGroups.delete(ctx, tx, { project: "TST", group: area?.id ?? "", labels: "ungroup" })),
	).rejects.toThrow();

	const type = (await run((ctx, tx) => labels.list(ctx, tx, { project: "TST" }))).groups.find(
		(group) => group.name === "Type",
	);
	const ungrouped = await run((ctx, tx) =>
		labelGroups.delete(ctx, tx, { project: "TST", group: type?.id ?? "", labels: "ungroup" }),
	);
	expect(ungrouped).toEqual({ deleted: type?.id ?? "", ungrouped: 1, deletedLabels: 0 });

	const deleted = await run((ctx, tx) =>
		labelGroups.delete(ctx, tx, { project: "TST", group: area?.id ?? "", labels: "delete" }),
	);
	expect(deleted).toEqual({ deleted: area?.id ?? "", ungrouped: 0, deletedLabels: 2 });
	const after = await run((ctx, tx) => labels.list(ctx, tx, { project: "TST" }));
	expect(after.groups).toEqual([]);
	expect(after.labels.map((label) => label.name)).toEqual(["bug", "chore"]);
});
