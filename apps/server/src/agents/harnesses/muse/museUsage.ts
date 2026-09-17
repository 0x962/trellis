import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// The subscription usage of a Muse login. Muse learns it from the response
// of each model call and announces it to its session client, so the only
// place Trellis can read it is a Muse session that Trellis runs. The bridge
// saves the latest announcement next to the sessions of that Muse home, and
// the account card reads it from there.
export const MUSE_USAGE_FILE = "trellis-usage.json";

const window = z.object({ usedPercent: z.number(), resetsAtMs: z.number() });
export const MuseUsageSchema = z.object({
	observedAtMs: z.number(),
	tier: z.string().optional(),
	window: window.extend({ windowDurationMins: z.number() }).optional(),
	weekly: window.optional(),
});
export type MuseUsage = z.infer<typeof MuseUsageSchema>;

export async function writeMuseUsage(museHome: string, usage: unknown) {
	const snapshot = MuseUsageSchema.parse(usage);
	const path = join(museHome, MUSE_USAGE_FILE);
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
	await rename(temporary, path);
	return snapshot;
}

export async function readMuseUsage(museHome: string): Promise<MuseUsage | null> {
	try {
		return MuseUsageSchema.parse(JSON.parse(await readFile(join(museHome, MUSE_USAGE_FILE), "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

// The quota windows of a snapshot that are still open at `now`. A window
// whose reset time has passed holds a count that reset with it, so it is
// left out.
export function museUsageWindows(usage: MuseUsage, now: number) {
	const windows: Array<{ id: string; label: string; usedPercent: number; resetsAt: string }> = [];
	if (usage.window && usage.window.resetsAtMs > now)
		windows.push({
			id: "window",
			label: `Session (${Math.round(usage.window.windowDurationMins / 60)}h)`,
			usedPercent: usage.window.usedPercent,
			resetsAt: new Date(usage.window.resetsAtMs).toISOString(),
		});
	if (usage.weekly && usage.weekly.resetsAtMs > now)
		windows.push({
			id: "weekly",
			label: "Weekly",
			usedPercent: usage.weekly.usedPercent,
			resetsAt: new Date(usage.weekly.resetsAtMs).toISOString(),
		});
	return windows;
}
