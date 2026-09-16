import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { museUsageWindows, readMuseUsage, writeMuseUsage } from "./museUsage.ts";

const observedAtMs = Date.UTC(2026, 8, 16, 22, 0, 0);
const usage = {
	observedAtMs,
	tier: "27681631238169137",
	window: { usedPercent: 12, windowDurationMins: 300, resetsAtMs: observedAtMs + 4 * 3600_000 },
	weekly: { usedPercent: 1, resetsAtMs: observedAtMs + 3 * 86400_000 },
};

test("a Muse usage snapshot round trips through its file without a partial write", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-muse-usage-"));
	try {
		expect(await readMuseUsage(home)).toBeNull();
		await writeMuseUsage(home, { ...usage, extra: "ignored" });
		expect(await readMuseUsage(home)).toEqual(usage);
		expect(await readdir(home)).toEqual(["trellis-usage.json"]);
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});

test("the open windows of a snapshot become quota meters, and a reset window drops out", () => {
	expect(museUsageWindows(usage, observedAtMs + 60_000)).toEqual([
		{ id: "window", label: "Session (5h)", usedPercent: 12, resetsAt: new Date(usage.window.resetsAtMs).toISOString() },
		{ id: "weekly", label: "Weekly", usedPercent: 1, resetsAt: new Date(usage.weekly.resetsAtMs).toISOString() },
	]);
	expect(museUsageWindows(usage, observedAtMs + 5 * 3600_000).map((window) => window.id)).toEqual(["weekly"]);
	expect(museUsageWindows(usage, observedAtMs + 8 * 86400_000)).toEqual([]);
});
