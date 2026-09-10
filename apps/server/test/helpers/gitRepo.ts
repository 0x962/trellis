import { mkdtempSync } from "node:fs";
import { join } from "node:path";

// Makes a git repository under TRELLIS_HOME that holds `branches`, and
// returns its path. A test points a fake Superset project at it, so the base
// branch check in agents.setSettings reads a real checkout. The repository
// needs one commit: git lists no branch before the first commit.
export const gitRepo = (branches: string[] = ["main"]): string => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "repo-"));
	const git = (args: string[]) => {
		const done = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
		if (done.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${done.stderr.toString()}`);
	};
	git(["init", "-b", branches[0]!]);
	git(["-c", "user.name=trellis", "-c", "user.email=trellis@example.com", "commit", "--allow-empty", "-m", "init"]);
	for (const branch of branches.slice(1)) git(["branch", branch]);
	return dir;
};
