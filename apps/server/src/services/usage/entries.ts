import { collectLogFiles, dedupeLogFiles } from "./logs.ts";
import { collectMuseEntries } from "./muse.ts";
import { collectOpencodeEntries } from "./opencode.ts";
import { parseClaudeLogFile, parseCodexLogFile, type UsageLogEntry } from "./parse.ts";
import { collectPiEntries } from "./pi.ts";
import type { UsageRoot } from "./roots.ts";

// One entry with the names of the accounts whose profile holds its
// transcript. An empty list means the default login of the harness.
export type CollectedEntry = UsageLogEntry & { accounts: readonly string[] };

export type CollectedUsage = {
	entries: CollectedEntry[];
	// The first user prompt of each session, by session id.
	sessionLabels: Map<string, string>;
	scannedFiles: number;
};

const tag = (entries: readonly UsageLogEntry[], accounts: readonly string[]): CollectedEntry[] =>
	entries.map((entry) => ({ ...entry, accounts }));

const collectClaudeUsage = async (
	roots: readonly UsageRoot[],
	days: number,
	cutoffMs: number,
): Promise<CollectedUsage> => {
	const entries: CollectedEntry[] = [];
	const sessionLabels = new Map<string, string>();
	const entriesByMessage = new Map<string, UsageLogEntry>();
	const accountsByMessage = new Map<string, readonly string[]>();
	const fileGroups = await Promise.all(
		roots.map(async (root) => dedupeLogFiles(await collectLogFiles(root.path, days + 1))),
	);
	for (const [index, root] of roots.entries()) {
		const out: UsageLogEntry[] = [];
		const before = new Set(entriesByMessage.keys());
		for (const file of fileGroups[index]!)
			await parseClaudeLogFile(file, entriesByMessage, cutoffMs, out, sessionLabels);
		for (const key of entriesByMessage.keys()) if (!before.has(key)) accountsByMessage.set(key, root.accounts);
		for (const entry of tag(out, root.accounts)) entries.push(entry);
	}
	for (const [key, entry] of entriesByMessage) {
		entries.push({ ...entry, accounts: accountsByMessage.get(key) ?? [] });
	}
	return {
		entries,
		sessionLabels,
		scannedFiles: fileGroups.reduce((total, files) => total + files.length, 0),
	};
};

const collectRootUsage = async (root: UsageRoot, days: number, cutoffMs: number): Promise<CollectedUsage> => {
	const out: UsageLogEntry[] = [];
	const sessionLabels = new Map<string, string>();
	let scannedFiles: number;
	if (root.harness === "codex") {
		const files = dedupeLogFiles(await collectLogFiles(root.path, days + 1));
		for (const file of files) await parseCodexLogFile(file, cutoffMs, out, sessionLabels);
		scannedFiles = files.length;
	} else if (root.harness === "pi") {
		scannedFiles = await collectPiEntries(root.path, days, cutoffMs, out, sessionLabels);
	} else if (root.harness === "muse") {
		scannedFiles = await collectMuseEntries(root.path, days, cutoffMs, out, sessionLabels);
	} else {
		scannedFiles = await collectOpencodeEntries(root.path, cutoffMs, out, sessionLabels);
	}
	return { entries: tag(out, root.accounts), sessionLabels, scannedFiles };
};

// Reads every transcript under `roots` with a turn at or after `cutoffMs`.
// Each non-Claude root can run at the same time. The Claude roots share one
// message map, so profiles that hold the same session count each request once.
export async function collectUsageEntries(
	roots: readonly UsageRoot[],
	days: number,
	cutoffMs: number,
): Promise<CollectedUsage> {
	const entries: CollectedEntry[] = [];
	const sessionLabels = new Map<string, string>();
	let scannedFiles = 0;
	const claudeRoots = roots.filter((root) => root.harness === "claude");
	const otherRoots = roots.filter((root) => root.harness !== "claude");
	const results = await Promise.all([
		collectClaudeUsage(claudeRoots, days, cutoffMs),
		...otherRoots.map((root) => collectRootUsage(root, days, cutoffMs)),
	]);
	for (const result of results) {
		for (const entry of result.entries) entries.push(entry);
		for (const [sessionId, label] of result.sessionLabels) {
			if (!sessionLabels.has(sessionId)) sessionLabels.set(sessionId, label);
		}
		scannedFiles += result.scannedFiles;
	}
	return { entries, sessionLabels, scannedFiles };
}
