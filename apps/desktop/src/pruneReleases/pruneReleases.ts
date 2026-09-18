import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

// `releases/` under the desktop user data holds one directory per package
// release, named by the release hash. The desktop service adds a directory
// for each installed package and starts the host from the active one. The
// execution service and the hooks of a running agent run from the release
// that started them, so a release stays until every process that names it
// has exited.

const releaseName = /^[a-f0-9]{64}$/;

// A `.pending-*` directory is a copy in progress. One older than this
// belongs to a copy that stopped halfway.
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

// The release directories that may go: every release that `keep` does not
// name and that no live process names in its arguments or its environment.
// `processText` is the output of `ps -E`: one line per process with its
// command line and its environment.
export const releasesToRemove = (names: string[], keep: Set<string>, processText: string) =>
	names.filter((name) => releaseName.test(name) && !keep.has(name) && !processText.includes(`/releases/${name}/`));

const liveProcessText = () =>
	execFileSync("/bin/ps", ["-axwwE", "-o", "command="], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// Removes the releases that `releasesToRemove` names and the stale
// `.pending-*` copies. Returns the names of the removed releases.
export const pruneReleases = (releases: string, keep: string[], now = Date.now()) => {
	const names = readdirSync(releases);
	const removed = releasesToRemove(names, new Set(keep), liveProcessText());
	for (const name of removed) rmSync(join(releases, name), { recursive: true, force: true });
	for (const name of names) {
		if (!name.startsWith(".pending-")) continue;
		if (now - statSync(join(releases, name)).mtimeMs < PENDING_MAX_AGE_MS) continue;
		rmSync(join(releases, name), { recursive: true, force: true });
	}
	return removed;
};
