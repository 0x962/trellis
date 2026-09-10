import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { seedChild, seedProject, seedRootWithStatuses, seedTicket } from "./fixtures";
import { freshDb, type TestDb } from "./helpers/db.ts";
import { countStatements } from "./helpers/statements.ts";
import { assertStatusInvariant } from "./invariants.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

// Root CDE with statuses, child web without statuses, and one ticket in
// each whose status belongs to CDE.
const seedFixtures = async () => {
	const { rootId, statuses } = await seedProject(h.db, "CDE");
	const web = await seedChild(h.db, rootId, rootId, "web");
	await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	await seedTicket(h.db, { projectId: web, rootId, statusId: statuses.started });
	return { rootId, web, statuses };
};

describe("assertStatusInvariant", () => {
	test("assertStatusInvariant passes on the seeded fixtures", async () => {
		await seedFixtures();
		await h.db.transaction((tx) => assertStatusInvariant(tx));
	});

	// The status FK accepts any status row, so a ticket can point at a status
	// of another root. Only the invariant check catches it.
	test("assertStatusInvariant fails on a planted violation", async () => {
		const { rootId, web } = await seedFixtures();
		const ops = await seedRootWithStatuses(h.db, "OPS");
		await seedTicket(h.db, { projectId: web, rootId, statusId: ops.statuses.todo, number: 77 });
		const run = h.db.transaction((tx) => assertStatusInvariant(tx));
		await expect(run).rejects.toThrow(/CDE-77/);
		await expect(run).rejects.toThrow(ops.statuses.todo);
	});

	test("assertStatusInvariant is one statement", async () => {
		await seedFixtures();
		await h.db.transaction(async (tx) => {
			const statements = await countStatements(h.db.$client, () => assertStatusInvariant(tx));
			expect(statements).toBe(1);
		});
	});
});
