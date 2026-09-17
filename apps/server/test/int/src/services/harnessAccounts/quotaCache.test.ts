import { afterAll, expect, test } from "bun:test";
import type { HarnessAccountQuota } from "@trellis/api";
import { sql } from "drizzle-orm";
import { prepareQuota } from "../../../../../src/services/harnessAccounts/quota.ts";
import type { IoCtx } from "../../../../../src/services/support.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
afterAll(async () => {
	await h.read(assertStatusInvariant);
	await h.close();
});
test("quota reads share a cached result and enforce the refresh interval", async () => {
	h = await serviceHarness();
	await h.read((tx) =>
		tx.execute(
			sql`INSERT INTO harness_accounts(id,name,harness,profile_path,created_at,updated_at) VALUES ('cache','Cache','pi','/tmp/cache',now(),now())`,
		),
	);
	const ctx = { newTx: h.read, home: "quota-cache-test" } as IoCtx;
	let calls = 0,
		now = 1000000;
	const load = async (): Promise<HarnessAccountQuota> => {
		calls++;
		return {
			accountId: "cache",
			status: "unlimited",
			email: null,
			plan: null,
			detail: null,
			windows: [],
			fetchedAt: new Date(now).toISOString(),
		};
	};
	const deps = { load, now: () => now };
	const [first, second] = await Promise.all([
		prepareQuota(ctx, { id: "cache" }, deps),
		prepareQuota(ctx, { id: "cache" }, deps),
	]);
	expect(calls).toBe(1);
	expect(first).toBe(second);
	now += 9999;
	await prepareQuota(ctx, { id: "cache", refresh: true }, deps);
	expect(calls).toBe(1);
	now += 1;
	await prepareQuota(ctx, { id: "cache", refresh: true }, deps);
	expect(calls).toBe(2);
	now += 299999;
	await prepareQuota(ctx, { id: "cache" }, deps);
	expect(calls).toBe(2);
	now += 1;
	await prepareQuota(ctx, { id: "cache" }, deps);
	expect(calls).toBe(3);
});
