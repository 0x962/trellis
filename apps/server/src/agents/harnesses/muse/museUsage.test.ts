import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { museUsageWindows, readMuseUsage, writeMuseQuotaError, writeMuseUsage } from "./museUsage.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Muse usage", () => {
	test("keeps a quota error after a late normal snapshot", async () => {
		const museHome = await mkdtemp(join(tmpdir(), "trellis-muse-usage-"));
		directories.push(museHome);
		const reset = Date.parse("2026-09-17T02:30:15Z");
		const quotaObservedAt = reset - 60_000;

		expect(
			await writeMuseQuotaError(
				museHome,
				"Subscription quota exhausted. Your usage window resets at 2026-09-17T02:30:15Z. (rate_limit_error)",
				quotaObservedAt,
			),
		).toBe(true);
		await writeMuseUsage(museHome, {
			observedAtMs: quotaObservedAt - 60_000,
			tier: "team",
			window: { usedPercent: 95, resetsAtMs: reset, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});

		const usage = await readMuseUsage(museHome);
		expect(usage).toEqual({
			observedAtMs: quotaObservedAt,
			tier: "team",
			window: { usedPercent: 95, resetsAtMs: reset, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
			exhausted: { resetsAtMs: reset },
		});
		expect(museUsageWindows(usage!, reset - 1)).toEqual([
			{
				id: "window",
				label: "Session (5h)",
				usedPercent: 100,
				resetsAt: "2026-09-17T02:30:15.000Z",
			},
			{
				id: "weekly",
				label: "Weekly",
				usedPercent: 25,
				resetsAt: "2026-09-24T02:30:15.000Z",
			},
		]);
	});

	test("uses a normal snapshot observed after a quota error", async () => {
		const museHome = await mkdtemp(join(tmpdir(), "trellis-muse-usage-"));
		directories.push(museHome);
		const reset = Date.parse("2026-09-17T02:30:15Z");
		const quotaObservedAt = reset - 60_000;

		expect(
			await writeMuseQuotaError(
				museHome,
				"Subscription quota exhausted. Your usage window resets at 2026-09-17T02:30:15Z. (rate_limit_error)",
				quotaObservedAt,
			),
		).toBe(true);
		await writeMuseUsage(museHome, {
			observedAtMs: quotaObservedAt + 60_000,
			tier: "team",
			window: { usedPercent: 1, resetsAtMs: reset + 18_000_000, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});

		const usage = await readMuseUsage(museHome);
		expect(usage).toEqual({
			observedAtMs: quotaObservedAt + 60_000,
			tier: "team",
			window: { usedPercent: 1, resetsAtMs: reset + 18_000_000, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});
		expect(museUsageWindows(usage!, reset)).toEqual([
			{
				id: "window",
				label: "Session (5h)",
				usedPercent: 1,
				resetsAt: "2026-09-17T07:30:15.000Z",
			},
			{
				id: "weekly",
				label: "Weekly",
				usedPercent: 25,
				resetsAt: "2026-09-24T02:30:15.000Z",
			},
		]);
	});
});
