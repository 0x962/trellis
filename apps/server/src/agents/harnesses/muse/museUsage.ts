import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// `writeMuseUsage` saves normal usage, and `writeMuseQuotaError` saves the
// reset time from a subscription quota error. Both functions write
// `MUSE_USAGE_FILE` next to the Muse sessions. `fetchAccountQuota` reads it.
export const MUSE_USAGE_FILE = "trellis-usage.json";

const window = z.object({ usedPercent: z.number(), resetsAtMs: z.number() });
export const MuseUsageSchema = z.object({
	observedAtMs: z.number(),
	tier: z.string().optional(),
	window: window.extend({ windowDurationMins: z.number() }).optional(),
	weekly: window.optional(),
	exhausted: z.object({ resetsAtMs: z.number() }).optional(),
});
export type MuseUsage = z.infer<typeof MuseUsageSchema>;

const quotaReset = /Subscription quota exhausted\. Your usage window resets at ([0-9T:.-]+Z)\.? \(rate_limit_error\)/;

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

export async function writeMuseQuotaError(museHome: string, message: string, observedAtMs = Date.now()) {
	const resetsAt = quotaReset.exec(message)?.[1];
	if (resetsAt === undefined) return false;
	const resetsAtMs = Date.parse(resetsAt);
	if (!Number.isFinite(resetsAtMs)) return false;
	const usage = await readMuseUsage(museHome);
	await writeMuseUsage(museHome, { ...usage, observedAtMs, exhausted: { resetsAtMs } });
	return true;
}

export const museQuotaExhausted = (usage: MuseUsage, now: number) =>
	usage.exhausted !== undefined && usage.exhausted.resetsAtMs > now;

// The quota windows of a snapshot that are still open at `now`. A window
// whose reset time has passed holds a count that reset with it, so it is
// left out.
export function museUsageWindows(usage: MuseUsage, now: number) {
	const windows: Array<{ id: string; label: string; usedPercent: number; resetsAt: string }> = [];
	const exhausted = usage.exhausted;
	if (exhausted !== undefined && museQuotaExhausted(usage, now))
		windows.push({
			id: "window",
			label: usage.window ? `Session (${Math.round(usage.window.windowDurationMins / 60)}h)` : "Usage window",
			usedPercent: 100,
			resetsAt: new Date(exhausted.resetsAtMs).toISOString(),
		});
	else if (usage.window && usage.window.resetsAtMs > now)
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
