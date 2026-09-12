import { describe, expect, test } from "bun:test";
import {
	dana,
	seedChild,
	seedProject,
	seedRootWithStatuses,
	seedStatus,
	seedStatuses,
	seedTicket,
} from "../../../fixtures";
import { activityOf, expectErrorData, ticketHarness, ticketRow } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";
import * as tickets from "../../../../src/services/tickets.ts";

const h = ticketHarness();

const moveTo = (id: string, project: string) =>
	h.as(dana)((ctx, tx) => tickets.update(ctx, tx, { ticket: id, project }));

// A root with its six statuses, a sub-project `web`, and one ticket in the
// root's In Progress.
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const webId = await seedChild(h.db, rootId, rootId, "web");
	const id = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started });
	return { rootId, statuses, webId, id };
};

describe("tickets.update project", () => {
	test("a project move remaps the status by name and category", async () => {
		const { webId, id } = await seed();
		const web = await seedStatuses(h.db, webId);
		const { result: ticket } = await moveTo(id, "CDE.web");
		expect(ticket.project.id).toBe(webId);
		expect(ticket.status.id).toBe(web.started);
		expect((await ticketRow(h.db, id))!).toMatchObject({ project_id: webId, status_id: web.started });
		await h.db.transaction((tx) => assertStatusInvariant(tx));
	});

	test("a project move falls back to the lowest status of the same category", async () => {
		const { webId, id } = await seed();
		await seedStatus(h.db, { projectId: webId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const doing = await seedStatus(h.db, { projectId: webId, name: "Doing", category: "started", position: 1 });
		await seedStatus(h.db, { projectId: webId, name: "Working", category: "started", position: 2 });
		const { result: ticket } = await moveTo(id, "CDE.web");
		expect(ticket.status.id).toBe(doing);
	});

	test("a project move falls back to the owner default status", async () => {
		const { webId, id } = await seed();
		const todo = await seedStatus(h.db, {
			projectId: webId,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		await seedStatus(h.db, { projectId: webId, name: "Done", category: "done", position: 1 });
		const { result: ticket } = await moveTo(id, "CDE.web");
		expect(ticket.status.id).toBe(todo);
	});

	test("a project move across roots throws CROSS_ROOT_MOVE", async () => {
		const { rootId, id } = await seed();
		await seedRootWithStatuses(h.db, "OPS");
		await expectErrorData(moveTo(id, "OPS"), "CROSS_ROOT_MOVE");
		expect((await ticketRow(h.db, id))!.project_id).toBe(rootId);
	});

	test("a project move writes the project row and the remap row in one batch", async () => {
		const { webId, id } = await seed();
		await seedStatuses(h.db, webId);
		await moveTo(id, "CDE.web");
		const rows = await activityOf(h.db, id);
		expect(rows).toHaveLength(2);
		expect(rows.map((row) => row.field)).toEqual(["project", "status"]);
		expect(rows[0]!.batch_id).toBe(rows[1]!.batch_id);
		expect(rows[0]!.id).toBeLessThan(rows[1]!.id);
	});
});
