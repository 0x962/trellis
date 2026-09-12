import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { seedChild, seedProject, seedRootWithStatuses, seedStatuses, seedTicket } from "../../../fixtures";
import { activityRows, eventsOfType, expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import * as projects from "../../../../src/services/projects.ts";

// A move re-parents a project inside its root, or reorders it among its
// siblings with `after` and `before`. A project never becomes its own
// ancestor and never leaves its root. When the move changes owner(P), the
// tickets of the scope are remapped onto the new owner's set by name.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const move = (input: Parameters<typeof projects.move>[2]) => h.run((ctx, tx) => projects.move(ctx, tx, input));

const parentOf = async (id: string) =>
	(
		await h.one<{ parent_id: string | null; root_id: string }>(
			sql`SELECT parent_id, root_id FROM projects WHERE id = ${id}`,
		)
	).parent_id;

const childSlugs = async (ref: string) =>
	(await h.run((ctx, tx) => projects.get(ctx, tx, { project: ref }))).children.map((child) => child.slug);

const statusIds = (ticketIds: string[]) =>
	h.rows<{ id: string; status_id: string }>(
		sql`SELECT id, status_id FROM tickets WHERE id = ANY(${sql.param(ticketIds)}::text[]) ORDER BY number`,
	);

const seedCde = async () => {
	const seeded = await seedProject(h.db, "CDE");
	return { cde: seeded.rootId, statuses: seeded.statuses };
};

describe("projects.move parent", () => {
	test("a move to a sibling parent rewrites parent_id and emits project.moved", async () => {
		const { cde } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		const api = await seedChild(h.db, cde, cde, "api");
		await h.rebuild();
		const moved = await move({ project: "CDE.web", parent: "CDE.api" });
		expect(moved.parentId).toBe(api);
		expect(moved.path).toBe("CDE.api.web");
		expect(await parentOf(web)).toBe(api);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.field).toBe("parent");
		expect(rows[0]!.project_id).toBe(web);
		expect(rows[0]!.ticket_id).toBeNull();
		expect(eventsOfType(h.flushed, "project.moved")).toEqual([{ type: "project.moved", id: web }]);
	});

	test("a move under a descendant throws PARENT_CYCLE", async () => {
		const { cde } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		const auth = await seedChild(h.db, web, cde, "auth");
		await h.rebuild();
		await expectError(move({ project: "CDE.web", parent: "CDE.web.auth" }), "PARENT_CYCLE");
		expect(await parentOf(web)).toBe(cde);
		expect(await parentOf(auth)).toBe(web);
	});

	test("a move onto itself throws PARENT_CYCLE", async () => {
		const { cde } = await seedCde();
		await seedChild(h.db, cde, cde, "web");
		await h.rebuild();
		await expectError(move({ project: "CDE.web", parent: "CDE.web" }), "PARENT_CYCLE");
	});

	test("a move into another root throws CROSS_ROOT_MOVE", async () => {
		const { cde } = await seedCde();
		const a = await seedChild(h.db, cde, cde, "a");
		const ops = await seedRootWithStatuses(h.db, "OPS");
		await seedChild(h.db, ops.rootId, ops.rootId, "z");
		await h.rebuild();
		await expectError(move({ project: "CDE.a", parent: "OPS.z" }), "CROSS_ROOT_MOVE");
		expect(await parentOf(a)).toBe(cde);
	});

	test("a root cannot take a parent", async () => {
		await seedCde();
		await seedRootWithStatuses(h.db, "OPS");
		await h.rebuild();
		await expectError(move({ project: "CDE", parent: "OPS" }), "CROSS_ROOT_MOVE");
	});

	test("a null parent moves a project to the top level of its root", async () => {
		const { cde } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		const auth = await seedChild(h.db, web, cde, "auth");
		await h.rebuild();
		const moved = await move({ project: "CDE.web.auth", parent: null });
		expect(moved.parentId).toBe(cde);
		expect(moved.rootId).toBe(cde);
		expect(moved.path).toBe("CDE.auth");
		expect(await parentOf(auth)).toBe(cde);
	});

	test("a move into a parent that holds the slug throws DUPLICATE", async () => {
		const { cde } = await seedCde();
		const api = await seedChild(h.db, cde, cde, "api");
		await seedChild(h.db, api, cde, "web");
		const web = await seedChild(h.db, cde, cde, "web");
		await h.rebuild();
		const error = await expectError(move({ project: "CDE.web", parent: "CDE.api" }), "DUPLICATE");
		expect(error.data).toEqual({ field: "slug" });
		expect(await parentOf(web)).toBe(cde);
	});
});

describe("projects.move order", () => {
	test("an after anchor places the project between its neighbors", async () => {
		const { cde } = await seedCde();
		await seedChild(h.db, cde, cde, "a", { position: 0 });
		await seedChild(h.db, cde, cde, "b", { position: 1 });
		await seedChild(h.db, cde, cde, "c", { position: 2 });
		await h.rebuild();
		expect(await childSlugs("CDE")).toEqual(["a", "b", "c"]);
		await move({ project: "CDE.c", after: "CDE.a" });
		expect(await childSlugs("CDE")).toEqual(["a", "c", "b"]);
	});

	test("an anchor outside the target parent throws INVALID_ANCHOR", async () => {
		const { cde } = await seedCde();
		await seedChild(h.db, cde, cde, "a", { position: 0 });
		await seedChild(h.db, cde, cde, "b", { position: 1 });
		const ops = await seedRootWithStatuses(h.db, "OPS");
		await seedChild(h.db, ops.rootId, ops.rootId, "z");
		await h.rebuild();
		await expectError(move({ project: "CDE.b", after: "OPS.z" }), "INVALID_ANCHOR");
		expect(await childSlugs("CDE")).toEqual(["a", "b"]);
	});
});

describe("projects.move status owner", () => {
	test("a move across status owners remaps the subtree in one batch as system:trellis", async () => {
		const { cde, statuses } = await seedCde();
		const api = await seedChild(h.db, cde, cde, "api");
		const apiStatuses = await seedStatuses(h.db, api);
		const web = await seedChild(h.db, cde, cde, "web");
		const seed = { projectId: web, rootId: cde };
		const t1 = await seedTicket(h.db, { ...seed, statusId: statuses.todo, number: 1 });
		const t2 = await seedTicket(h.db, { ...seed, statusId: statuses.started, number: 2 });
		const t3 = await seedTicket(h.db, { ...seed, statusId: statuses.done, number: 3 });
		await h.rebuild();
		await move({ project: "CDE.web", parent: "CDE.api" });
		expect((await statusIds([t1, t2, t3])).map((row) => row.status_id)).toEqual([
			apiStatuses.todo,
			apiStatuses.started,
			apiStatuses.done,
		]);
		const remaps = (await activityRows(h)).filter((row) => row.action === "status.remapped");
		expect(remaps.map((row) => row.ticket_id).sort()).toEqual([t1, t2, t3].sort());
		expect(new Set(remaps.map((row) => row.batch_id)).size).toBe(1);
		for (const row of remaps)
			expect({ name: row.actor_name, kind: row.actor_kind }).toEqual({ name: "trellis", kind: "system" });
		expect(eventsOfType(h.flushed, "statuses.changed")).toEqual([{ type: "statuses.changed", projectId: web }]);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a move inside the same status owner remaps nothing", async () => {
		const { cde, statuses } = await seedCde();
		await seedChild(h.db, cde, cde, "api");
		const web = await seedChild(h.db, cde, cde, "web");
		const t1 = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: statuses.todo, number: 1 });
		const t2 = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: statuses.done, number: 2 });
		await h.rebuild();
		await move({ project: "CDE.web", parent: "CDE.api" });
		expect((await statusIds([t1, t2])).map((row) => row.status_id)).toEqual([statuses.todo, statuses.done]);
		expect((await activityRows(h)).filter((row) => row.action === "status.remapped")).toEqual([]);
		await h.read((tx) => assertStatusInvariant(tx));
	});

	test("a project that owns statuses keeps its tickets on that set after a move", async () => {
		const { cde } = await seedCde();
		const api = await seedChild(h.db, cde, cde, "api");
		await seedStatuses(h.db, api);
		const web = await seedChild(h.db, cde, cde, "web");
		const own = await seedStatuses(h.db, web);
		const t1 = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: own.todo, number: 1 });
		const t2 = await seedTicket(h.db, { projectId: web, rootId: cde, statusId: own.started, number: 2 });
		await h.rebuild();
		await move({ project: "CDE.web", parent: "CDE.api" });
		expect((await statusIds([t1, t2])).map((row) => row.status_id)).toEqual([own.todo, own.started]);
		expect((await activityRows(h)).filter((row) => row.action === "status.remapped")).toEqual([]);
		await h.read((tx) => assertStatusInvariant(tx));
	});
});
