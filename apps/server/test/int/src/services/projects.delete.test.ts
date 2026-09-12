import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import {
	type ActorRef,
	claude,
	count,
	seedActivity,
	seedChild,
	seedComment,
	seedProject,
	seedStatuses,
	seedTicket,
} from "../../../fixtures";
import {
	activityRows,
	eventsOfType,
	expectError,
	type Harness,
	NOW,
	serviceHarness,
} from "../../../helpers/services.ts";
import * as projects from "../../../../src/services/projects.ts";

// A delete is hard. Without `force` the subtree must be empty. With `force`
// every project and ticket below goes too. A human deletes without force;
// an agent needs force. One activity row on the parent keeps the trace.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const remove = (input: { project: string; force?: boolean }, actor?: ActorRef) =>
	h.run((ctx, tx) => projects.delete(ctx, tx, input), actor === undefined ? {} : { actor });

const ids = (table: string) =>
	h
		.rows<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
		.then((rows) => rows.map((r) => r.id));

const seedCde = async () => {
	const seeded = await seedProject(h.db, "CDE");
	return { cde: seeded.rootId, statuses: seeded.statuses };
};

describe("projects.delete", () => {
	test("an empty sub-project deletes and leaves the trace row on the parent", async () => {
		const { cde } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web", { name: "Web" });
		await h.rebuild();
		const result = await remove({ project: "CDE.web" });
		expect(result).toEqual({ deleted: "CDE.web" });
		expect(await ids("projects")).toEqual([cde]);
		expect(eventsOfType(h.flushed, "project.deleted")).toEqual([{ type: "project.deleted", id: web }]);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.project_id).toBe(cde);
		expect(rows[0]!.root_id).toBe(cde);
		expect(rows[0]!.ticket_id).toBeNull();
		expect(rows[0]!.action).toBe("project.deleted");
		expect(rows[0]!.meta).toMatchObject({ path: "CDE.web", name: "Web" });
	});

	test("a delete of a non-empty project throws PROJECT_NOT_EMPTY with the counts", async () => {
		const { cde, statuses } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		await seedChild(h.db, web, cde, "sub");
		await seedTicket(h.db, { projectId: web, rootId: cde, statusId: statuses.todo });
		await seedTicket(h.db, { projectId: web, rootId: cde, statusId: statuses.todo });
		await h.rebuild();
		const error = await expectError(remove({ project: "CDE.web" }), "PROJECT_NOT_EMPTY");
		expect(error.data).toEqual({ tickets: 2, projects: 1 });
		expect(await count(h.db, "projects")).toBe(3);
	});

	test("force deletes the whole subtree", async () => {
		const { cde, statuses } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		const sub = await seedChild(h.db, web, cde, "sub");
		const api = await seedChild(h.db, cde, cde, "api");
		const kept = await seedTicket(h.db, { projectId: api, rootId: cde, statusId: statuses.todo });
		await seedTicket(h.db, { projectId: web, rootId: cde, statusId: statuses.todo });
		const parent = await seedTicket(h.db, { projectId: sub, rootId: cde, statusId: statuses.todo });
		await seedTicket(h.db, { projectId: sub, rootId: cde, statusId: statuses.done, parentId: parent });
		await h.rebuild();
		const result = await remove({ project: "CDE.web", force: true });
		expect(result).toEqual({ deleted: "CDE.web" });
		expect((await ids("projects")).sort()).toEqual([cde, api].sort());
		expect(await ids("tickets")).toEqual([kept]);
	});

	test("an agent cannot delete a project without force", async () => {
		const { cde } = await seedCde();
		await seedChild(h.db, cde, cde, "web");
		await h.rebuild();
		const error = await expectError(remove({ project: "CDE.web" }, claude), "AGENT_CANNOT_DELETE");
		expect(error.status).toBe(403);
		expect(await count(h.db, "projects")).toBe(2);
	});

	test("an agent deletes a project with force", async () => {
		const { cde } = await seedCde();
		await seedChild(h.db, cde, cde, "web");
		await h.rebuild();
		expect(await remove({ project: "CDE.web", force: true }, claude)).toEqual({ deleted: "CDE.web" });
		expect(await ids("projects")).toEqual([cde]);
	});

	test("a delete of an archived project throws PROJECT_ARCHIVED", async () => {
		const { cde } = await seedCde();
		await seedChild(h.db, cde, cde, "web", { archived_at: NOW });
		await h.rebuild();
		await expectError(remove({ project: "CDE.web", force: true }), "PROJECT_ARCHIVED");
		expect(await count(h.db, "projects")).toBe(2);
	});

	test("a forced root delete cascades to statuses, tickets, and activity", async () => {
		const { cde, statuses } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		await seedStatuses(h.db, web);
		const ticket = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: statuses.todo });
		await seedComment(h.db, ticket, "A comment");
		await seedActivity(h.db, { rootId: cde, projectId: cde, ticketId: ticket, field: "title" });
		await seedActivity(h.db, { rootId: cde, projectId: web, action: "project.updated" });
		await h.rebuild();
		await remove({ project: "CDE", force: true });
		for (const table of ["projects", "statuses", "tickets", "comments", "activity", "repos"]) {
			expect(await count(h.db, table), table).toBe(0);
		}
		expect(eventsOfType(h.flushed, "project.deleted")).toEqual([{ type: "project.deleted", id: cde }]);
	});
});
