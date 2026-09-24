import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { heldScratchNames, SCRATCH_PREFIX } from "./decide.ts";

// The sweep of the scratch directories that the agents leave in the
// temporary directory of the person. AGENTS.md tells an agent to remove its
// own directory when the work ends. This sweep removes the ones that the
// agent left behind.

// An agent run works for hours in one scratch checkout, and a person reads
// the files of a failed run on the same day. A directory whose newest file
// is a day old belongs to work that ended.
export const SCRATCH_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type ScratchSweepResult = { removedScratch: number; removedScratchBytes: number; errors: string[] };

// The newest modification time in the tree, and the bytes its files hold.
// Null when `path` itself is gone.
//
// A build writes deep inside its scratch directory and leaves the top
// directory untouched, so the newest time in the whole tree says when the
// work stopped. The walk reads a symbolic link as its own entry and never
// follows it, because a scratch checkout links to a `node_modules` outside
// the tree.
//
// The agent that owns a scratch directory can remove it while the walk
// reads it. The walk skips an entry it cannot read and counts the rest,
// because one removal by an owner must not stop the sweep. A removal of the
// whole directory gives null, and the caller then counts no removal of its
// own.
const treeState = async (path: string) => {
	if ((await lstat(path).catch(() => null)) === null) return null;
	let bytes = 0;
	let newestMs = 0;
	const pending = [path];
	while (pending.length > 0) {
		const current = pending.pop() as string;
		const info = await lstat(current).catch(() => null);
		if (info === null) continue;
		if (info.mtimeMs > newestMs) newestMs = info.mtimeMs;
		if (info.isDirectory()) {
			for (const name of await readdir(current).catch(() => [])) pending.push(join(current, name));
			continue;
		}
		if (info.isFile()) bytes += info.size;
	}
	return { bytes, newestMs };
};

// Removes each scratch directory under `root` that no process holds open
// and whose newest file is older than `SCRATCH_MIN_AGE_MS`. `openPaths`
// holds every path that a process on this computer has open. Returns the
// number of directories that went, the bytes they held, and one line per
// directory that stayed against the decision.
//
// A directory whose files the sweep cannot unlink, such as one whose mode
// denies a write, keeps its own line and the sweep goes on to the next
// name. `readdir` gives the same order at every sweep, so a stop at the
// first such name would hold every name after it for ever.
export const sweepScratch = async (root: string, now: number, openPaths: string[]): Promise<ScratchSweepResult> => {
	const held = heldScratchNames(openPaths, [root, await realpath(root)]);
	const result: ScratchSweepResult = { removedScratch: 0, removedScratchBytes: 0, errors: [] };
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.startsWith(SCRATCH_PREFIX)) continue;
		if (held.has(entry.name)) continue;
		const path = join(root, entry.name);
		const state = await treeState(path);
		if (state === null) continue;
		if (now - state.newestMs < SCRATCH_MIN_AGE_MS) continue;
		const failure = await rm(path, { recursive: true, force: true }).then(
			() => null,
			(error: unknown) => (error instanceof Error ? error.message : String(error)),
		);
		if (failure !== null) {
			result.errors.push(`${path}: ${failure}`);
			continue;
		}
		result.removedScratch += 1;
		result.removedScratchBytes += state.bytes;
	}
	return result;
};
