import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lock } from "proper-lockfile";
import { z } from "zod";

// Several Muse bridge processes can write usage for one account. The lock
// makes each file keep the event with the newest `observedAtMs` value.
// `fetchAccountQuota` reads and combines the normal usage and quota files.
export const MUSE_USAGE_FILE = "trellis-usage.json";
export const MUSE_QUOTA_FILE = "trellis-quota.json";
const MUSE_USAGE_LOCK_FILE = "trellis-usage.lock";

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

async function readSnapshot<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
	try {
		return schema.parse(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

async function writeLatestSnapshot<T extends { observedAtMs: number }>(
	museHome: string,
	file: string,
	schema: z.ZodType<T>,
	snapshot: T,
) {
	const release = await lock(museHome, {
		lockfilePath: join(museHome, MUSE_USAGE_LOCK_FILE),
		realpath: false,
		retries: { retries: 80, minTimeout: 25, maxTimeout: 250 },
	});
	try {
		const path = join(museHome, file);
		const saved = await readSnapshot(path, schema);
		if (saved !== null && saved.observedAtMs > snapshot.observedAtMs) return saved;
		await writeSnapshot(path, snapshot);
		return snapshot;
	} finally {
		await release();
	}
}

export async function writeMuseUsage(museHome: string, usage: unknown) {
	const snapshot = MuseUsageSchema.parse(usage);
	return writeLatestSnapshot(museHome, MUSE_USAGE_FILE, MuseUsageSchema, snapshot);
}

export async function readMuseUsage(museHome: string): Promise<MuseUsage | null> {
	const [usage, quota] = await Promise.all([
		readSnapshot(join(museHome, MUSE_USAGE_FILE), MuseUsageSchema),
		readSnapshot(join(museHome, MUSE_QUOTA_FILE), MuseQuotaSchema),
	]);
	if (quota === null || (usage !== null && usage.observedAtMs > quota.observedAtMs)) return usage;
	return {
		...usage,
		observedAtMs: Math.max(usage?.observedAtMs ?? 0, quota.observedAtMs),
		exhausted: { resetsAtMs: quota.resetsAtMs },
	};
}

export async function writeMuseQuotaError(museHome: string, message: string, observedAtMs: number) {
	const resetsAt = quotaReset.exec(message)?.[1];
	if (resetsAt === undefined) return false;
	const resetsAtMs = Date.parse(resetsAt);
	if (!Number.isFinite(resetsAtMs)) return false;
	await writeLatestSnapshot(museHome, MUSE_QUOTA_FILE, MuseQuotaSchema, { observedAtMs, resetsAtMs });
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
