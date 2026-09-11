import { mkdtempSync } from "node:fs";
import { join } from "node:path";

// A git checkout whose origin/HEAD names `branch`, as `git clone` leaves it.
// `git symbolic-ref` reads the name only, so the branch itself need not
// exist. With `branch` null the checkout has no origin/HEAD.
export const gitRepo = (branch: string | null) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "repo-"));
	const git = (...args: string[]) => {
		const done = Bun.spawnSync(["git", "-C", dir, ...args]);
		if (done.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${done.stderr.toString()}`);
	};
	git("init", "-q");
	if (branch !== null) git("symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${branch}`);
	return dir;
};

// Adds `branch` to the checkout at `dir` as a branch of the remote origin,
// one of the two forms `superset ws create --base-branch` accepts. The
// branch needs a commit to point at, so the first call makes an empty one.
export const remoteBranch = (dir: string, branch: string) => {
	const git = (...args: string[]) => {
		const done = Bun.spawnSync(["git", "-C", dir, ...args]);
		if (done.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${done.stderr.toString()}`);
	};
	git("-c", "user.email=test@trellis", "-c", "user.name=test", "commit", "--allow-empty", "-q", "-m", "seed");
	git("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
};
