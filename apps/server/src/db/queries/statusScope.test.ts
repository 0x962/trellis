import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { seedChild, seedNested, seedRoot, seedStatuses } from "../../../test/fixtures";
import { freshDb, type TestDb } from "../../../test/helpers/db.ts";
import { statusScope } from "./statusScope.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const sorted = (ids: string[]) => [...ids].sort();

describe("statusScope", () => {
	test("statusScope returns the inheriting subtree and stops at an owner", async () => {
		const r = await seedRoot(h.db, "RRR");
		const a = await seedChild(h.db, r, r, "a");
		const b = await seedChild(h.db, a, r, "b");
		const c = await seedChild(h.db, b, r, "c");
		await seedStatuses(h.db, r);
		await seedStatuses(h.db, b);
		await h.db.transaction(async (tx) => {
			expect(sorted(await statusScope(tx, r))).toEqual(sorted([r, a]));
			expect(sorted(await statusScope(tx, b))).toEqual(sorted([b, c]));
		});
	});

	// The plan sets no maximum depth for the project tree.
	test("statusScope follows a chain deeper than 64 projects", async () => {
		const r = await seedRoot(h.db, "RRR");
		const chain = await seedNested(h.db, r, 70);
		await seedStatuses(h.db, r);
		await h.db.transaction(async (tx) => {
			expect(sorted(await statusScope(tx, r))).toEqual(sorted([r, ...chain]));
		});
	});

	test("statusScope of a leaf returns the leaf", async () => {
		const r = await seedRoot(h.db, "RRR");
		const a = await seedChild(h.db, r, r, "a");
		await seedStatuses(h.db, r);
		await h.db.transaction(async (tx) => {
			expect(await statusScope(tx, a)).toEqual([a]);
		});
	});
});
