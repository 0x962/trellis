import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { seedProject, seedTicket } from "../../../../fixtures";
import { freshDb, type TestDb } from "../../../../helpers/db.ts";
import { counts } from "../../../../../src/db/queries/counts.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type Input = Parameters<typeof counts>[1];

const run = (input: Input) => h.db.transaction((tx) => counts(tx, input));

describe("counts", () => {
	test("counts groups by status and totals", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		const perStatus = [
			[statuses.todo, 3],
			[statuses.started, 2],
			[statuses.done, 1],
		] as const;
		for (const [statusId, n] of perStatus) {
			for (let i = 0; i < n; i++) await seedTicket(h.db, { projectId: rootId, rootId, statusId });
		}
		const statusIds = Object.values(statuses);
		const result = await run({ projectIds: [rootId], statusIds });
		expect(result.total).toBe(6);
		expect(result.byStatus.map((row) => row.statusId)).toEqual(statusIds);
		expect(result.byStatus.map((row) => row.count)).toEqual([3, 2, 0, 0, 1, 0]);
		expect(result.byStatus.reduce((sum, row) => sum + row.count, 0)).toBe(result.total);
	});

	test("counts honors the list filters", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		for (const statusId of [statuses.todo, statuses.started, statuses.done, statuses.done]) {
			await seedTicket(h.db, { projectId: rootId, rootId, statusId });
		}
		const statusIds = Object.values(statuses);
		const result = await run({ projectIds: [rootId], statusIds, categories: ["done"] });
		expect(result.total).toBe(2);
		expect(result.byStatus.map((row) => row.count)).toEqual([0, 0, 0, 0, 2, 0]);
	});
});
