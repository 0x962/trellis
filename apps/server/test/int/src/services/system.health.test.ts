import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { GhStatus } from "@trellis/api";
import { sql } from "drizzle-orm";
import { health } from "../../../../src/services/system.ts";
import { testCtx } from "../../../helpers/ctx.ts";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { freshHomeWithDirs } from "../../../helpers/home.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// health answers the version pair, the boot id, the resident memory of this
// process, and the size of the database. The gh field repeats the state the
// poller keeps, so the banner and the health check never disagree.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const downGh: GhStatus = {
	ok: false,
	user: null,
	reason: "unauthenticated",
	message: "To get started with GitHub CLI, please run: gh auth login",
	checkedAt: "2026-09-09T10:00:00.000Z",
};

describe("system.health", () => {
	test("health reports the resident memory and the database size", async () => {
		const handle = testCtx({ db: h.db, home });
		const sizeRow = await h.db.execute(sql`SELECT pg_database_size(current_database())::bigint AS bytes`);

		const result = await h.db.transaction((tx) => health(handle.ctx, tx, {}));

		expect(result.ok).toBe(true);
		expect(result.version).toBe(handle.ctx.version);
		expect(result.apiVersion).toBe(handle.ctx.apiVersion);
		expect(result.bootId).toBe(handle.ctx.bootId);
		expect(result.rss).toBeGreaterThan(0);
		expect(result.db.ok).toBe(true);
		expect(result.db.sizeBytes).toBe(Number(sizeRow.rows[0]!.bytes));
	});

	test("health carries the current gh state", async () => {
		const handle = testCtx({ db: h.db, home, ghStatus: () => downGh });

		const result = await h.db.transaction((tx) => health(handle.ctx, tx, {}));

		expect(result.gh).toEqual(downGh);
	});

	// An install from another checkout shows here as a different checkout.
	test("health reports the checkout and the commit the server runs from", async () => {
		const source = { checkout: "/Users/dana/projects/trellis", commit: "0123456789abcdef0123456789abcdef01234567" };
		const handle = testCtx({ db: h.db, home, source });

		const result = await h.db.transaction((tx) => health(handle.ctx, tx, {}));

		expect(result.source).toEqual(source);
	});

	test("health lists the URLs the server listens on", async () => {
		const addresses = ["http://192.168.1.20:4521", "http://127.0.0.1:4521"];
		const handle = testCtx({ db: h.db, home, addresses: () => addresses });

		const result = await h.db.transaction((tx) => health(handle.ctx, tx, {}));

		expect(result.addresses).toEqual(addresses);
	});
});
