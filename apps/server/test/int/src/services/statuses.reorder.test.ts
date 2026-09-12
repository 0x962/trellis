import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as statuses from "../../../../src/services/statuses.ts";
import { seedChild, seedProject, seedRootWithStatuses, seedTicket } from "../../../fixtures";
import { activityRows, eventsOfType, expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// A reorder takes the whole effective set and writes the positions 0 to
// n minus 1 in the given order on the owner's rows. A ticket keeps its
// status through a reorder.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const reorder = (project: string, refs: string[]) =>
	h.run((ctx, tx) => statuses.reorder(ctx, tx, { project, statuses: refs }));

const positions = (projectId: string) =>
	h.rows<{ id: string; position: number }>(
		sql`SELECT id, position FROM statuses WHERE project_id = ${projectId} ORDER BY position`,
	);

const seedCde = async () => {
	const seeded = await seedProject(h.db, "CDE");
	await h.rebuild();
	return { cde: seeded.rootId, statuses: seeded.statuses };
};

describe("statuses.reorder", () => {
	test("reorder writes the positions 0 to n minus 1 in the given order", async () => {
		const { cde, statuses: s } = await seedCde();
		const order = [s.canceled, s.done, s.humanReview, s.agentReview, s.started, s.todo];
		const result = await reorder("CDE", order);
		expect(result.statuses.map((status) => status.id)).toEqual(order);
		expect(result.statuses.map((status) => status.position)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(result.inheritedFrom).toBeNull();
		expect(await positions(cde)).toEqual(order.map((id, position) => ({ id, position })));
		expect(eventsOfType(h.flushed, "statuses.changed")).toEqual([{ type: "statuses.changed", projectId: cde }]);
	});

	test("reorder needs the whole set and refuses a foreign status", async () => {
		const { cde, statuses: s } = await seedCde();
		const ops = await seedRootWithStatuses(h.db, "OPS");
		await h.rebuild();
		const all = Object.values(s);
		const missingOne = await expectError(reorder("CDE", all.slice(1)), "STATUS_NOT_IN_PROJECT");
		expect((missingOne.data.valid as Array<{ id: string }>).map((status) => status.id)).toEqual(all);
		const foreign = await expectError(reorder("CDE", [...all.slice(0, 5), ops.statuses.todo]), "STATUS_NOT_IN_PROJECT");
		expect((foreign.data.valid as Array<{ id: string }>).map((status) => status.id)).toEqual(all);
		expect(await positions(cde)).toEqual(all.map((id, position) => ({ id, position })));
		expect(h.flushed).toEqual([]);
	});

	test("reorder through an inheriting project reorders the owner's set", async () => {
		const { cde, statuses: s } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		await h.rebuild();
		const order = [s.started, s.todo, s.agentReview, s.humanReview, s.done, s.canceled];
		const result = await reorder("CDE.web", order);
		expect(result.inheritedFrom).toBe(cde);
		expect(await positions(cde)).toEqual(order.map((id, position) => ({ id, position })));
		expect(await positions(web)).toEqual([]);
	});

	test("reorder moves no ticket", async () => {
		const { cde, statuses: s } = await seedCde();
		const all = Object.values(s);
		const tickets: Array<{ id: string; status_id: string }> = [];
		for (const statusId of all) {
			const id = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId });
			tickets.push({ id, status_id: statusId });
		}
		await reorder("CDE", [...all].reverse());
		const after = await h.rows<{ id: string; status_id: string }>(
			sql`SELECT id, status_id FROM tickets ORDER BY number`,
		);
		expect(after).toEqual(tickets);
		expect((await activityRows(h)).filter((row) => row.action === "status.remapped")).toEqual([]);
		await h.read((tx) => assertStatusInvariant(tx));
	});
});
