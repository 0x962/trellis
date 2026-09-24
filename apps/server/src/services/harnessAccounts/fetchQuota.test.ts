import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeMuseUsage } from "../../agents/harnesses/muse/museUsage.ts";
import { tempDirs } from "../../tempDir.ts";
import { fetchAccountQuota } from "./fetchQuota.ts";

const tempDir = tempDirs();

describe("Muse account quota", () => {
	test("returns windows observed no more than 60 seconds ago", async () => {
		const profilePath = await tempDir("trellis-muse-quota-");
		const museHome = join(profilePath, "muse");
		await mkdir(museHome);
		const now = Date.parse("2026-09-17T12:00:00Z");
		await writeMuseUsage(museHome, {
			observedAtMs: now - 60_000,
			tier: "team",
			window: { usedPercent: 25, resetsAtMs: now + 3_600_000, windowDurationMins: 300 },
			weekly: { usedPercent: 50, resetsAtMs: now + 86_400_000 },
		});

		const result = await fetchAccountQuota(
			{
				id: "01J00000000000000000000000",
				name: "Muse",
				harness: "muse",
				profilePath,
				isDefault: false,
				createdAt: "2026-09-17T00:00:00.000Z",
				updatedAt: "2026-09-17T00:00:00.000Z",
			},
			fetch,
			async () => ({ token: null, email: "person@example.com", plan: "team" }),
			now,
		);

		expect(result.status).toBe("ok");
		expect(result.fetchedAt).toBe("2026-09-17T11:59:00.000Z");
		expect(result.windows).toHaveLength(2);
	});

	test("does not return windows from an older observation", async () => {
		const profilePath = await tempDir("trellis-muse-quota-");
		const museHome = join(profilePath, "muse");
		await mkdir(museHome);
		const now = Date.parse("2026-09-17T12:00:00Z");
		await writeMuseUsage(museHome, {
			observedAtMs: now - 60_001,
			tier: "team",
			window: { usedPercent: 25, resetsAtMs: now + 3_600_000, windowDurationMins: 300 },
			weekly: { usedPercent: 50, resetsAtMs: now + 86_400_000 },
		});

		const result = await fetchAccountQuota(
			{
				id: "01J00000000000000000000000",
				name: "Muse",
				harness: "muse",
				profilePath,
				isDefault: false,
				createdAt: "2026-09-17T00:00:00.000Z",
				updatedAt: "2026-09-17T00:00:00.000Z",
			},
			fetch,
			async () => ({ token: null, email: "person@example.com", plan: "team" }),
			now,
		);

		expect(result.status).toBe("unavailable");
		expect(result.windows).toEqual([]);
		expect(result.fetchedAt).toBe("2026-09-17T12:00:00.000Z");
	});
});
