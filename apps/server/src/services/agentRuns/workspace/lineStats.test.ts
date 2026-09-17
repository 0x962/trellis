import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { countWorkspace } from "./lineStats.ts";

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const git = async (directory: string, args: string[]) => {
	await exec("git", ["-C", directory, ...args]);
};

const createWorkspace = async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-line-stats-"));
	roots.push(root);
	const repository = join(root, "repository");
	const workspace = join(root, "workspace");
	await mkdir(repository);
	await git(repository, ["init", "--initial-branch=main"]);
	await writeFile(join(repository, "source.txt"), "one\ntwo\nthree\n");
	await git(repository, ["add", "source.txt"]);
	await git(repository, [
		"-c",
		"user.name=Trellis Test",
		"-c",
		"user.email=trellis@example.com",
		"commit",
		"-m",
		"base",
	]);
	await git(repository, ["worktree", "add", "-b", "agent", workspace, "HEAD"]);
	return workspace;
};

describe("workspace line stats", () => {
	test("uses the repository worktree when the repository has no remote", async () => {
		const workspace = await createWorkspace();
		await writeFile(join(workspace, "source.txt"), "one\ntwo\nthree\nfour\n");

		expect(await countWorkspace(workspace)).toEqual({ additions: 1, deletions: 0 });
	});

	test("does not count a file rename as added and deleted lines", async () => {
		const workspace = await createWorkspace();
		await git(workspace, ["mv", "source.txt", "renamed.txt"]);

		expect(await countWorkspace(workspace)).toEqual({ additions: 0, deletions: 0 });
	});
});
