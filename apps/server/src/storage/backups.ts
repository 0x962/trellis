import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

// A backup copies the data home to `backups/snapshot-<stamp>`, then writes
// `backups/trellis-<stamp>.tar.gz.partial` and renames it when tar exits 0.
// A finished archive never carries the `.partial` suffix, so a name with it
// is always an archive that stopped halfway.

export const SNAPSHOT_PREFIX = "snapshot-";
export const PARTIAL_SUFFIX = ".partial";

// Removes the snapshot copies and the partial archives of backups that
// stopped halfway. The boot calls it before the server accepts requests, so
// no backup of this process is running. Returns the removed names.
export const sweepBackups = (dir: string) => {
	const leftovers = readdirSync(dir).filter(
		(name) => name.startsWith(SNAPSHOT_PREFIX) || name.endsWith(PARTIAL_SUFFIX),
	);
	for (const name of leftovers) rmSync(join(dir, name), { recursive: true, force: true });
	return leftovers;
};
