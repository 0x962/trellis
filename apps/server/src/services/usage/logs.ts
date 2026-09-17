import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type LogFile = { path: string; mtimeMs: number };

// Every `.jsonl` file under `root` that changed within `maxAgeDays`. A
// transcript directory grows to several GB over months, and an old file
// never changes, so the mtime bound keeps the scan small.
//
// A directory symlink is not followed. A cycle would collect the same file
// many times before ELOOP stops the walk, and a `~/.config/claude` link to
// `~/.claude` would count every session twice.
export async function collectLogFiles(root: string, maxAgeDays: number): Promise<LogFile[]> {
	const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
	const results: LogFile[] = [];
	async function walk(dir: string): Promise<void> {
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			// The root of a harness that is not installed does not exist.
			return;
		}
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				try {
					const info = await stat(path);
					if (info.mtimeMs >= cutoffMs) results.push({ path, mtimeMs: info.mtimeMs });
				} catch {
					// The CLI removed the file during the scan.
				}
			}
		}
	}
	await walk(root);
	return results;
}

// One entry per path. Two scan roots can overlap, and a file counts once.
export function dedupeLogFiles(files: LogFile[]): LogFile[] {
	const byPath = new Map<string, LogFile>();
	for (const file of files) byPath.set(file.path, file);
	return [...byPath.values()];
}
