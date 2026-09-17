import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

// Muse can send normal usage from several bridge processes for one account.
// A separate quota file keeps a late normal snapshot from removing an active
// quota error. `fetchAccountQuota` reads and combines both files.
export const MUSE_USAGE_FILE = "trellis-usage.json";
export const MUSE_QUOTA_FILE = "trellis-quota.json";

const window = z.object({ usedPercent: z.number(), resetsAtMs: z.number() });
export const MuseUsageSchema = z.object({
	observedAtMs: z.number(),
	tier: z.string().optional(),
	window: window.extend({ windowDurationMins: z.number() }).optional(),
	weekly: window.optional(),
	exhausted: z.object({ resetsAtMs: z.number() }).optional(),
});
export type MuseUsage = z.infer<typeof MuseUsageSchema>;

const MuseQuotaSchema = z.object({ observedAtMs: z.number(), resetsAtMs: z.number() });
const quotaReset = /Subscription quota exhausted\. Your usage window resets at ([0-9T:.-]+Z)\.? \(rate_limit_error\)/;

async function writeSnapshot(path: string, snapshot: unknown) {
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
	await rename(temporary, path);
}

export async function writeMuseUsage(museHome: string, usage: unknown) {
	const snapshot = MuseUsageSchema.parse(usage);
	await writeSnapshot(join(museHome, MUSE_USAGE_FILE), snapshot);
	return snapshot;
}

async function readSnapshot<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
	try {
		return schema.parse(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function readMuseUsage(museHome: string): Promise<MuseUsage | null> {
	const [usage, quota] = await Promise.all([
		readSnapshot(join(museHome, MUSE_USAGE_FILE), MuseUsageSchema),
		readSnapshot(join(museHome, MUSE_QUOTA_FILE), MuseQuotaSchema),
	]);
	if (quota === null) return usage;
	return {
		...usage,
		observedAtMs: Math.max(usage?.observedAtMs ?? 0, quota.observedAtMs),
		exhausted: { resetsAtMs: quota.resetsAtMs },
	};
}

export async function writeMuseQuotaError(museHome: string, message: string, observedAtMs = Date.now()) {
	const resetsAt = quotaReset.exec(message)?.[1];
	if (resetsAt === undefined) return false;
	const resetsAtMs = Date.parse(resetsAt);
	if (!Number.isFinite(resetsAtMs)) return false;
	await writeSnapshot(join(museHome, MUSE_QUOTA_FILE), { observedAtMs, resetsAtMs });
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
