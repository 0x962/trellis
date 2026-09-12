import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createCache } from "../../../../src/db/cache.ts";
import { seedChild, seedRoot, seedStatuses } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

// Root CDE, child web, and grandchild auth: the path CDE.web.auth.
const seedTree = async () => {
	const cde = await seedRoot(h.db, "CDE");
	const web = await seedChild(h.db, cde, cde, "web");
	const auth = await seedChild(h.db, web, cde, "auth");
	return { cde, web, auth };
};

const rebuilt = async () => {
	const cache = createCache();
	await h.db.transaction((tx) => cache.rebuild(tx));
	return cache;
};

describe("project cache", () => {
	test("resolveSubtree returns the project and every descendant", async () => {
		const { cde, web, auth } = await seedTree();
		const cache = await rebuilt();
		expect(cache.resolveSubtree(cde)).toEqual([cde, web, auth]);
		expect(cache.resolveSubtree(web)).toEqual([web, auth]);
		expect(cache.resolveSubtree(auth)).toEqual([auth]);
	});

	test("resolvePath resolves a dotted path case-insensitively and returns null for a missing segment", async () => {
		const { cde, auth } = await seedTree();
		const cache = await rebuilt();
		expect(cache.resolvePath("CDE.web.auth")).toBe(auth);
		expect(cache.resolvePath("cde.WEB.auth")).toBe(auth);
		expect(cache.resolvePath("CDE")).toBe(cde);
		expect(cache.resolvePath("CDE.nope")).toBeNull();
	});

	test("the cache serves effective statuses and changes only on rebuild", async () => {
		const { cde, web } = await seedTree();
		const cdeStatuses = await seedStatuses(h.db, cde);
		const cache = await rebuilt();
		const inherited = cache.effectiveStatuses(web);
		expect(inherited.ownerId).toBe(cde);
		expect(inherited.statuses.map((status) => status.id)).toEqual(Object.values(cdeStatuses));

		const webStatuses = await seedStatuses(h.db, web);
		expect(cache.effectiveStatuses(web).ownerId).toBe(cde);
		await h.db.transaction((tx) => cache.rebuild(tx));
		const own = cache.effectiveStatuses(web);
		expect(own.ownerId).toBe(web);
		expect(own.statuses.map((status) => status.id)).toEqual(Object.values(webStatuses));
	});
});
