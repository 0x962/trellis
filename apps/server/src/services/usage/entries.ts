import { collectLogFiles, dedupeLogFiles } from "./logs.ts";
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

// Reads every transcript under `roots` with a turn at or after `cutoffMs`.
// The Claude message map is shared across every Claude root, so a session
// that two profiles both hold counts once.
export async function collectUsageEntries(
	roots: readonly UsageRoot[],
	days: number,
	cutoffMs: number,
): Promise<CollectedUsage> {
	const entries: CollectedEntry[] = [];
	const sessionLabels = new Map<string, string>();
	let scannedFiles = 0;
	const tag = (out: UsageLogEntry[], accounts: readonly string[]) => {
		for (const entry of out) entries.push({ ...entry, accounts });
	};

	const claudeEntriesByMessage = new Map<string, UsageLogEntry>();
	const claudeAccountsByMessage = new Map<string, readonly string[]>();
	for (const root of roots) {
		const out: UsageLogEntry[] = [];
		if (root.harness === "claude") {
			const files = dedupeLogFiles(await collectLogFiles(root.path, days + 1));
			scannedFiles += files.length;
			const before = new Set(claudeEntriesByMessage.keys());
			for (const file of files) await parseClaudeLogFile(file, claudeEntriesByMessage, cutoffMs, out, sessionLabels);
			for (const key of claudeEntriesByMessage.keys())
				if (!before.has(key)) claudeAccountsByMessage.set(key, root.accounts);
		} else if (root.harness === "codex") {
			const files = dedupeLogFiles(await collectLogFiles(root.path, days + 1));
			scannedFiles += files.length;
			for (const file of files) await parseCodexLogFile(file, cutoffMs, out, sessionLabels);
		} else if (root.harness === "pi") {
			scannedFiles += await collectPiEntries(root.path, days, cutoffMs, out, sessionLabels);
		} else {
			scannedFiles += await collectOpencodeEntries(root.path, cutoffMs, out, sessionLabels);
		}
		tag(out, root.accounts);
	}
	for (const [key, entry] of claudeEntriesByMessage) {
		entries.push({ ...entry, accounts: claudeAccountsByMessage.get(key) ?? [] });
	}
	return { entries, sessionLabels, scannedFiles };
}
