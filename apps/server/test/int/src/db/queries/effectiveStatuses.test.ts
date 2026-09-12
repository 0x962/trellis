import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { seedChild, seedNested, seedRoot, seedStatuses } from "../../../../fixtures";
import { freshDb, type TestDb } from "../../../../helpers/db.ts";
import { effectiveStatuses, ownerOf } from "../../../../../src/db/queries/effectiveStatuses.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

// The chain R > a > b > c.
const seedChain = async () => {
	const r = await seedRoot(h.db, "RRR");
	const a = await seedChild(h.db, r, r, "a");
	const b = await seedChild(h.db, a, r, "b");
	const c = await seedChild(h.db, b, r, "c");
	return { r, a, b, c };
};

describe("effective statuses", () => {
	test("owner resolves through three levels to the root", async () => {
		const { r, c } = await seedChain();
		const statuses = await seedStatuses(h.db, r);
		await h.db.transaction(async (tx) => {
			expect(await ownerOf(tx, c)).toBe(r);
			const rows = await effectiveStatuses(tx, c);
			expect(rows.map((row) => row.id)).toEqual(Object.values(statuses));
		});
	});

	test("owner is the nearest ancestor-or-self that owns statuses", async () => {
		const { r, a, c } = await seedChain();
		await seedStatuses(h.db, r);
		await seedStatuses(h.db, a);
		await h.db.transaction(async (tx) => {
			expect(await ownerOf(tx, c)).toBe(a);
			expect(await ownerOf(tx, a)).toBe(a);
			expect(await ownerOf(tx, r)).toBe(r);
		});
	});

	// The plan sets no maximum depth for the project tree, so the deepest
	// project of a 70-level chain still inherits the root's statuses.
	test("owner is found above a chain deeper than 64 projects", async () => {
		const r = await seedRoot(h.db, "RRR");
		const chain = await seedNested(h.db, r, 70);
		const statuses = await seedStatuses(h.db, r);
		const deepest = chain.at(-1) as string;
		await h.db.transaction(async (tx) => {
			expect(await ownerOf(tx, deepest)).toBe(r);
			const rows = await effectiveStatuses(tx, deepest);
			expect(rows.map((row) => row.id)).toEqual(Object.values(statuses));
		});
	});

	// The parent check refuses parent_id = id, and nothing in the schema
	// refuses a two-node cycle. The walk stops at depth 64, so a cycle
	// yields no owner instead of a query that never returns.
	test("the recursive CTE stops at depth 64 on a planted cycle", async () => {
		const r = await seedRoot(h.db, "RRR");
		const a = await seedChild(h.db, r, r, "a");
		const b = await seedChild(h.db, a, r, "b");
		await h.db.execute(sql`UPDATE projects SET parent_id = ${b} WHERE id = ${a}`);
		await h.db.transaction(async (tx) => {
			expect(await ownerOf(tx, a)).toBeNull();
		});
	}, 2000);
});
