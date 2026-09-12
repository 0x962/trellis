import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { StatusSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { seedChild, seedProject, seedStatus, seedStatuses, seedTicket } from "../../../fixtures";
import { activityRows, eventsOfType, expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import * as statuses from "../../../../src/services/statuses.ts";

// A new status appends at the next position unless the caller names one.
// The first status a sub-project creates copies the inherited set into the
// sub-project first, so the set stays whole, and remaps the tickets of the
// scope onto the copies by name.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type StatusRow = {
	id: string;
	name: string;
	slug: string;
	category: string;
	reviewer: string | null;
	color: string;
	position: number;
	is_default: boolean;
};

const create = (input: Parameters<typeof statuses.create>[2]) => h.run((ctx, tx) => statuses.create(ctx, tx, input));

const statusRows = (projectId: string) =>
	h.rows<StatusRow>(
		sql`SELECT id, name, slug, category, reviewer, color, position, is_default FROM statuses WHERE project_id = ${projectId} ORDER BY position`,
	);

const shape = (row: StatusRow) => ({
	name: row.name,
	category: row.category,
	reviewer: row.reviewer,
	color: row.color,
	position: row.position,
	is_default: row.is_default,
});

const seedCde = async () => {
	const seeded = await seedProject(h.db, "CDE");
	await h.rebuild();
	return { cde: seeded.rootId, statuses: seeded.statuses };
};

// CDE > web inherits the root's set and holds one ticket on Todo and one on Done.
const seedInheriting = async () => {
	const { cde, statuses: root } = await seedCde();
	const web = await seedChild(h.db, cde, cde, "web");
	const onTodo = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: root.todo, number: 1 });
	const onDone = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: root.done, number: 2 });
	await h.rebuild();
	return { cde, web, root, onTodo, onDone };
};

describe("statuses.create on an owner", () => {
	test("a new status appends at the next position with a slug from the name", async () => {
		const { cde } = await seedCde();
		const created = await create({ project: "CDE", name: "Blocked", category: "started" });
		expect(created.position).toBe(6);
		expect(created.slug).toBe("blocked");
		expect(created.projectId).toBe(cde);
		StatusSchema.parse(created);
		const rows = await statusRows(cde);
		expect(rows).toHaveLength(7);
		expect(rows[6]).toMatchObject({ name: "Blocked", slug: "blocked", position: 6, category: "started" });
	});

	test("a repeated status name or slug throws DUPLICATE", async () => {
		await seedCde();
		const byName = await expectError(create({ project: "CDE", name: "done", category: "done" }), "DUPLICATE");
		expect(byName.data).toEqual({ field: "name" });
		const bySlug = await expectError(create({ project: "CDE", name: "Done!", category: "done" }), "DUPLICATE");
		expect(bySlug.data).toEqual({ field: "slug" });
	});

	test("a create with isDefault moves the default off the previous status", async () => {
		const { cde, statuses: root } = await seedCde();
		const created = await create({ project: "CDE", name: "Backlog", category: "todo", isDefault: true });
		expect(created.isDefault).toBe(true);
		const rows = await statusRows(cde);
		expect(rows.filter((row) => row.is_default).map((row) => row.id)).toEqual([created.id]);
		expect(rows.find((row) => row.id === root.todo)!.is_default).toBe(false);
	});

	test("a create with a position inserts there and renumbers the set", async () => {
		const { cde } = await seedCde();
		const created = await create({ project: "CDE", name: "Triage", category: "todo", position: 1 });
		expect(created.position).toBe(1);
		const rows = await statusRows(cde);
		expect(rows.map((row) => row.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(rows.map((row) => row.name)).toEqual([
			"Todo",
			"Triage",
			"In Progress",
			"Agent Review",
			"Human Review",
			"Done",
			"Canceled",
		]);
	});
});

describe("statuses.create on an inheriting project", () => {
	test("the first status of a sub-project copies the inherited set first", async () => {
		const { cde, web } = await seedInheriting();
		const created = await create({ project: "CDE.web", name: "Blocked", category: "started" });
		expect(created.projectId).toBe(web);
		const own = await statusRows(web);
		const inherited = await statusRows(cde);
		expect(own).toHaveLength(7);
		expect(own.slice(0, 6).map(shape)).toEqual(inherited.map(shape));
		expect(own.slice(0, 6).map((row) => row.id)).not.toEqual(inherited.map((row) => row.id));
		expect(own[6]).toMatchObject({ name: "Blocked", position: 6 });
	});

	test("the materialization remaps the subtree onto the copies by name", async () => {
		const { web, onTodo, onDone } = await seedInheriting();
		await create({ project: "CDE.web", name: "Blocked", category: "started" });
		const own = await statusRows(web);
		const byName = new Map(own.map((row) => [row.name, row.id]));
		const tickets = await h.rows<{ id: string; status_id: string }>(
			sql`SELECT id, status_id FROM tickets ORDER BY number`,
		);
		expect(tickets).toEqual([
			{ id: onTodo, status_id: byName.get("Todo")! },
			{ id: onDone, status_id: byName.get("Done")! },
		]);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("the materialization emits statuses.changed and writes one remap batch", async () => {
		const { web, onTodo, onDone } = await seedInheriting();
		await create({ project: "CDE.web", name: "Blocked", category: "started" });
		expect(eventsOfType(h.flushed, "statuses.changed")).toEqual([{ type: "statuses.changed", projectId: web }]);
		const remaps = (await activityRows(h)).filter((row) => row.action === "status.remapped");
		expect(remaps.map((row) => row.ticket_id).sort()).toEqual([onTodo, onDone].sort());
		expect(new Set(remaps.map((row) => row.batch_id)).size).toBe(1);
		for (const row of remaps) {
			expect({ name: row.actor_name, kind: row.actor_kind }).toEqual({ name: "trellis", kind: "system" });
		}
	});

	test("a project that owns statuses copies nothing on a later create", async () => {
		const { cde } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		await seedStatuses(h.db, web);
		await seedStatus(h.db, { projectId: web, name: "Blocked", category: "started", position: 6 });
		await h.rebuild();
		await create({ project: "CDE.web", name: "Waiting", category: "started" });
		expect(await statusRows(web)).toHaveLength(8);
		expect(await statusRows(cde)).toHaveLength(6);
	});
});
