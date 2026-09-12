import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { branchState } from "../../../../src/agents/git.ts";

// Each case builds a real checkout, because branchState reads git itself.
// `refs` are the full ref names the checkout holds, for example
// "refs/heads/main" or "refs/remotes/origin/main".
const repoWith = (refs: string[]) => {
	const dir = mkdtempSync(join(process.env.TRELLIS_HOME!, "branch-"));
	const git = (...args: string[]) => {
		const done = Bun.spawnSync(["git", "-C", dir, ...args], {
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "t",
				GIT_AUTHOR_EMAIL: "t@t",
				GIT_COMMITTER_NAME: "t",
				GIT_COMMITTER_EMAIL: "t@t",
			},
		});
		if (done.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${done.stderr.toString()}`);
		return done.stdout.toString().trim();
	};
	git("init", "-q");
	git("commit", "--allow-empty", "-q", "-m", "first");
	const head = git("rev-parse", "HEAD");
	for (const ref of refs) git("update-ref", ref, head);
	return dir;
};

describe("branchState", () => {
	test("a local branch of that name is present", async () => {
		expect(await branchState(repoWith(["refs/heads/release"]), "release")).toBe("present");
	});

	test("a branch of a remote counts, because superset ws create takes it", async () => {
		expect(await branchState(repoWith(["refs/remotes/origin/release"]), "release")).toBe("present");
		expect(await branchState(repoWith(["refs/remotes/upstream/release"]), "release")).toBe("present");
	});

	test("a checkout without the branch answers absent", async () => {
		expect(await branchState(repoWith(["refs/heads/main"]), "release")).toBe("absent");
	});

	// git reads a pattern that holds no glob as the start of a path, so
	// `refs/heads/m0` also prints `refs/heads/m0/api`. A repository that
	// holds only the longer name holds no branch `m0`.
	test("a longer branch that starts with the name does not count", async () => {
		expect(await branchState(repoWith(["refs/heads/m0/api", "refs/heads/m0/ui"]), "m0")).toBe("absent");
		expect(await branchState(repoWith(["refs/remotes/origin/m0/api"]), "m0")).toBe("absent");
	});

	test("the longer name is still present under its own full name", async () => {
		expect(await branchState(repoWith(["refs/heads/m0/api"]), "m0/api")).toBe("present");
	});

	// Superset lists projects whose checkout this machine never cloned, and
	// a save must not fail on one of those.
	test("a path that is no repository answers unreadable", async () => {
		expect(await branchState(join(process.env.TRELLIS_HOME!, "no-such-directory"), "main")).toBe("unreadable");
	});
});
