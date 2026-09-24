import { describe, expect, test } from "bun:test";
import { tempDirs } from "../../../tempDir.ts";
import { museUsageWindows, readMuseUsage, writeMuseQuotaError, writeMuseUsage } from "./museUsage.ts";

const tempDir = tempDirs();

describe("Muse usage", () => {
	test("keeps a quota error after a late normal snapshot", async () => {
		const museHome = await tempDir("trellis-muse-usage-");
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
		const museHome = await tempDir("trellis-muse-usage-");
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

	test("rejects a stale normal snapshot after a newer normal snapshot", async () => {
		const museHome = await tempDir("trellis-muse-usage-");
		const reset = Date.parse("2026-09-17T02:30:15Z");

		expect(
			await writeMuseQuotaError(
				museHome,
				"Subscription quota exhausted. Your usage window resets at 2026-09-17T02:30:15Z. (rate_limit_error)",
				100,
			),
		).toBe(true);
		await writeMuseUsage(museHome, {
			observedAtMs: 200,
			tier: "team",
			window: { usedPercent: 1, resetsAtMs: reset + 18_000_000, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});
		await writeMuseUsage(museHome, {
			observedAtMs: 50,
			tier: "team",
			window: { usedPercent: 95, resetsAtMs: reset, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});

		const usage = await readMuseUsage(museHome);
		expect(usage).toEqual({
			observedAtMs: 200,
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

	test("rejects a delayed quota error observed before a newer normal snapshot", async () => {
		const museHome = await tempDir("trellis-muse-usage-");
		const reset = Date.parse("2026-09-17T02:30:15Z");
		const delayedQuotaWrite = () =>
			writeMuseQuotaError(
				museHome,
				"Subscription quota exhausted. Your usage window resets at 2026-09-17T02:30:15Z. (rate_limit_error)",
				100,
			);

		await writeMuseUsage(museHome, {
			observedAtMs: 101,
			tier: "team",
			window: { usedPercent: 1, resetsAtMs: reset + 18_000_000, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});
		expect(await delayedQuotaWrite()).toBe(true);

		expect(await readMuseUsage(museHome)).toEqual({
			observedAtMs: 101,
			tier: "team",
			window: { usedPercent: 1, resetsAtMs: reset + 18_000_000, windowDurationMins: 300 },
			weekly: { usedPercent: 25, resetsAtMs: reset + 604_800_000 },
		});
	});
});
