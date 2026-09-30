import { expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { UsageDays } from "@trellis/api";
import { tempDirs } from "../../../tempDir.ts";
import type { IoCtx } from "../../support.ts";
import { computeUsageReport } from "../aggregate.ts";
import { prepareRanking } from "../ranking";
import { prepareReport } from "../usage.ts";
import { reportStorage } from "./components/storage";
import { createReportCache } from "./reportCache.ts";

const tempDir = tempDirs();
const report = (days: UsageDays = 30, hour = 12) =>
	computeUsageReport({
		entries: [],
		sessionLabels: new Map(),
		scannedFiles: 7841,
		runs: [],
		projects: [],
		sessionAccounts: new Map(),
		days,
		cutoffMs: 0,
		now: new Date(`2026-09-30T${hour}:00:00Z`),
	});
const unexpectedScan = async (): Promise<never> => {
	throw new Error("A saved report must not scan");
};

test("a saved report survives restart and supplies report and ranking without database work", async () => {
	const home = await tempDir("trellis-usage-cache-");
	const first = report();
	await createReportCache().report(home, 30, false, async () => first);
	const restarted = createReportCache();
	expect(await restarted.report(home, 30, false, unexpectedScan)).toEqual(first);
	const ctx = { home, newTx: unexpectedScan } as unknown as IoCtx;
	expect((await prepareReport(ctx, { days: 30 })).computedAt).toBe(first.computedAt);
	const page = await prepareRanking(ctx, {
		days: 30,
		computedAt: first.computedAt,
		group: "account",
		metric: "usd",
		groupPage: 0,
		sessionPage: 0,
	});
	expect(page.sessionTotal).toBe(0);
	expect((await stat(join(home, "cache/usage-reports-v1/30.json"))).mode & 0o777).toBe(0o600);
});

test("concurrent first loads share one scan", async () => {
	const home = await tempDir("trellis-usage-cache-");
	const cache = createReportCache();
	const scan = Promise.withResolvers<ReturnType<typeof report>>();
	let calls = 0;
	const build = () => {
		calls++;
		return scan.promise;
	};
	const first = cache.report(home, 30, false, build);
	const second = cache.report(home, 30, true, build);
	scan.resolve(report());
	expect(await first).toEqual(await second);
	expect(calls).toBe(1);
});

test("reads and ranking pages retain completed data throughout a refresh", async () => {
	const home = await tempDir("trellis-usage-cache-");
	const cache = createReportCache();
	const first = await cache.report(home, 30, false, async () => report());
	const scan = Promise.withResolvers<ReturnType<typeof report>>();
	const refresh = cache.report(home, 30, true, () => scan.promise);
	const concurrent = cache.report(home, 30, true, unexpectedScan);
	expect(await cache.report(home, 30, false, unexpectedScan)).toBe(first);
	expect(await cache.ranking(home, 30, first.computedAt)).toBe(first);
	scan.resolve(report(30, 13));
	const next = await refresh;
	expect(await concurrent).toBe(next);
	expect(await cache.report(home, 30, false, unexpectedScan)).toBe(next);
	expect(await cache.ranking(home, 30, first.computedAt)).toBe(first);
	expect(await cache.ranking(home, 30, "2026-09-29T00:00:00Z")).toBeUndefined();
	expect(await createReportCache().report(home, 30, false, unexpectedScan)).toEqual(next);
});

test("a failed refresh preserves the completed report in memory and on disk", async () => {
	const home = await tempDir("trellis-usage-cache-");
	const cache = createReportCache();
	const first = await cache.report(home, 30, false, async () => report());
	await expect(
		cache.report(home, 30, true, async () => {
			throw new Error("Scan failed");
		}),
	).rejects.toThrow("Scan failed");
	expect(await cache.report(home, 30, false, unexpectedScan)).toBe(first);
	expect(await createReportCache().report(home, 30, false, unexpectedScan)).toEqual(first);
	expect((await cache.report(home, 30, true, async () => report(30, 13))).computedAt).not.toBe(first.computedAt);
});

test("account invalidation removes every range for its home and discards an older scan", async () => {
	const home = await tempDir("trellis-usage-cache-");
	const other = await tempDir("trellis-usage-cache-");
	const cache = createReportCache();
	await cache.report(home, 7, false, async () => report(7));
	await cache.report(home, 30, false, async () => report());
	await cache.report(other, 30, false, async () => report());
	const scan = Promise.withResolvers<ReturnType<typeof report>>();
	const refresh = cache.report(home, 30, true, () => scan.promise);
	await cache.invalidate(home);
	scan.resolve(report(30, 13));
	await refresh;
	expect(await createReportCache().ranking(home, 30, report(30, 13).computedAt)).toBeUndefined();
	expect(await cache.ranking(home, 7, report(7).computedAt)).toBeUndefined();
	expect(await createReportCache().report(other, 30, false, unexpectedScan)).toEqual(report());
});

test("invalidation waits for a file save and then removes that saved report", async () => {
	const home = await tempDir("trellis-usage-cache-");
	const writing = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const cache = createReportCache({
		...reportStorage,
		write: async (...args) => {
			writing.resolve();
			await release.promise;
			await reportStorage.write(...args);
		},
	});
	const first = cache.report(home, 30, false, async () => report());
	await writing.promise;
	const invalidation = cache.invalidate(home);
	release.resolve();
	await Promise.all([first, invalidation]);
	expect(await createReportCache().ranking(home, 30, report().computedAt)).toBeUndefined();
});
