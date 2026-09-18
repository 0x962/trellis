import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { HarnessAccountQuota } from "@trellis/api";
import type { IoCtx } from "../support.ts";
import { prepareQuota } from "./quota.ts";

describe("account quota cache", () => {
	test("refreshes a cached Muse result when its observation reaches 60 seconds", async () => {
		const observedAt = Date.parse("2026-09-17T12:00:00Z");
		let now = observedAt + 59_000;
		let loads = 0;
		const quota = (fetchedAt: string): HarnessAccountQuota => ({
			accountId: "01J00000000000000000000000",
			status: "ok",
			email: "person@example.com",
			plan: null,
			detail: null,
			windows: [{ id: "weekly", label: "Weekly", usedPercent: 50, resetsAt: null }],
			creditsBalance: null,
			extraUsage: null,
			fetchedAt,
		});
		const results = [quota(new Date(observedAt).toISOString()), quota(new Date(now + 2_000).toISOString())];
		const account = {
			id: "01J00000000000000000000000",
			name: "Muse",
			harness: "muse" as const,
			profilePath: "/tmp/muse",
			isDefault: false,
			createdAt: "2026-09-17T00:00:00.000Z",
			updatedAt: "2026-09-17T00:00:00.000Z",
		};
		const ctx = {
			home: `quota-test-${randomUUID()}`,
			newTx: async () => account,
		} as unknown as IoCtx;
		const deps = { load: async () => results[loads++]!, now: () => now };

		expect(await prepareQuota(ctx, { id: account.id }, deps)).toBe(results[0]!);
		now += 2_000;
		expect(await prepareQuota(ctx, { id: account.id }, deps)).toBe(results[1]!);
		expect(loads).toBe(2);
	});
});
