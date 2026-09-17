import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { nativeWorkspace } from "../../../agents/native/workspace.ts";
import { workspaceBaseRef } from "../../../agents/native/workspaceBase.ts";
import { countWorkspace, lineStats } from "./lineStats.ts";
import type { WorkspaceCtx } from "./types.ts";

const exec = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const git = async (directory: string, args: string[]) => {
	return (await exec("git", ["-C", directory, ...args])).stdout.trim();
};

const createRepository = async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-line-stats-"));
	roots.push(root);
	const repository = join(root, "repository");
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
	return { repository, root };
};

const run = {
	id: "01M2PT14NJDS107B4TGK6PNFDA",
	kind: "builder",
	runtime: "native",
	ticketIdentifier: "TRL-115",
	workspaceId: null,
} as const;

const createWorkspace = async () => {
	const { repository, root } = await createRepository();
	const workspace = await nativeWorkspace(join(root, "home"), run, repository);
	return { repository, root, workspace };
};

describe("workspace line stats", () => {
	test("uses the repository worktree when the repository has no remote", async () => {
		const { workspace } = await createWorkspace();
		await writeFile(join(workspace, "source.txt"), "one\ntwo\nthree\nfour\n");

		expect(await countWorkspace(workspace)).toEqual({ additions: 1, deletions: 0 });
	});

	test("does not count a file rename as added and deleted lines", async () => {
		const { workspace } = await createWorkspace();
		await git(workspace, ["mv", "source.txt", "renamed.txt"]);

		expect(await countWorkspace(workspace)).toEqual({ additions: 0, deletions: 0 });
	});

	test("uses the configured source worktree head as the base", async () => {
		const { repository, root } = await createRepository();
		const source = join(root, "source");
		await git(repository, ["worktree", "add", "-b", "source", source, "HEAD"]);
		await writeFile(join(source, "source.txt"), "one\ntwo\nthree\nfour\n");
		await git(source, ["add", "source.txt"]);
		await git(source, [
			"-c",
			"user.name=Trellis Test",
			"-c",
			"user.email=trellis@example.com",
			"commit",
			"-m",
			"source change",
		]);
		const sourceHead = await git(source, ["rev-parse", "HEAD"]);
		const workspace = await nativeWorkspace(join(root, "home"), run, source);
		await writeFile(join(workspace, "source.txt"), "one\ntwo\nthree\nfour\nfive\n");

		expect(await git(workspace, ["symbolic-ref", workspaceBaseRef])).toBe("refs/heads/source");
		expect(await git(workspace, ["rev-parse", workspaceBaseRef])).toBe(sourceHead);
		expect(await countWorkspace(workspace)).toEqual({ additions: 1, deletions: 0 });
	});

	test("excludes source branch changes that the workspace merges", async () => {
		const { repository, workspace } = await createWorkspace();
		await writeFile(join(repository, "upstream.txt"), "upstream\n");
		await git(repository, ["add", "upstream.txt"]);
		await git(repository, [
			"-c",
			"user.name=Trellis Test",
			"-c",
			"user.email=trellis@example.com",
			"commit",
			"-m",
			"upstream change",
		]);
		await git(workspace, ["merge", "--no-edit", "main"]);
		await writeFile(join(workspace, "agent.txt"), "agent\n");
		await git(workspace, ["add", "agent.txt"]);
		await git(workspace, [
			"-c",
			"user.name=Trellis Test",
			"-c",
			"user.email=trellis@example.com",
			"commit",
			"-m",
			"agent change",
		]);

		expect(await countWorkspace(workspace)).toEqual({ additions: 1, deletions: 0 });
	});

	test("records a base for a preserved workspace", async () => {
		const { repository, root } = await createRepository();
		const workspace = join(root, "workspace");
		await git(repository, ["worktree", "add", "-b", "agent", workspace, "HEAD"]);
		await git(workspace, ["update-ref", workspaceBaseRef, "HEAD"]);
		await writeFile(join(workspace, "source.txt"), "one\ntwo\nthree\nfour\n");
		const resumed = await nativeWorkspace(join(root, "home"), { ...run, workspaceId: workspace }, repository);

		expect(resumed).toBe(workspace);
		expect(await git(workspace, ["symbolic-ref", workspaceBaseRef])).toBe("refs/heads/main");
		expect(await countWorkspace(workspace)).toEqual({ additions: 1, deletions: 0 });
	});

	test("ignores an untracked nested repository", async () => {
		const { workspace } = await createWorkspace();
		const nested = join(workspace, "nested");
		await mkdir(nested);
		await git(nested, ["init", "--initial-branch=main"]);
		await writeFile(join(nested, "nested.txt"), "one\n");

		expect(await countWorkspace(workspace)).toEqual({ additions: 0, deletions: 0 });
	});

	test("keeps valid counts when another workspace fails", async () => {
		const { root, workspace } = await createWorkspace();
		await writeFile(join(workspace, "source.txt"), "one\ntwo\nthree\nfour\n");
		const ctx = {
			newTx: async () => [
				{ ticketId: "missing", workspace: join(root, "missing") },
				{ ticketId: "valid", workspace },
			],
		} as unknown as WorkspaceCtx;

		expect(await lineStats(ctx, { ticketIds: ["missing", "valid"] })).toEqual([
			{ ticketId: "valid", additions: 1, deletions: 0 },
		]);
	});
});
