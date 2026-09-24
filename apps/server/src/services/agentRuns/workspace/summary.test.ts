import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { nativeWorkspace } from "../../../agents/native/workspace.ts";
import { tempDirs } from "../../../tempDir.ts";
import { createSessionRepository } from "../../sessions/directory.ts";
import { readWorkspace, summarizeWorkspace } from "./summary.ts";

const tempDir = tempDirs();

const exec = promisify(execFile);
const git = async (directory: string, args: string[]) => (await exec("git", ["-C", directory, ...args])).stdout.trim();

const commit = (directory: string, message: string) =>
	git(directory, ["-c", "user.name=Trellis Test", "-c", "user.email=trellis@example.com", "commit", "-m", message]);

const createRoot = async () => {
	const root = await realpath(await tempDir("trellis-workspace-summary-"));
	return root;
};

const createRepository = async (root: string) => {
	const repository = join(root, "repository");
	await mkdir(repository);
	await git(repository, ["init", "--initial-branch=main"]);
	await writeFile(join(repository, "source.txt"), "one\ntwo\nthree\n");
	await git(repository, ["add", "source.txt"]);
	await commit(repository, "base");
	return repository;
};

const run = {
	id: "01M2PT14NJDS107B4TGK6PNFDA",
	kind: "session",
	runtime: "native",
	ticketIdentifier: null,
	workspaceId: null,
} as const;

describe("workspace summary", () => {
	test("names the branch, the base branch, and the changes of a project workspace", async () => {
		const root = await createRoot();
		const repository = await createRepository(root);
		const workspace = await nativeWorkspace(join(root, "home"), run, repository);
		await writeFile(join(workspace, "source.txt"), "one\ntwo\nfour\n");
		await git(workspace, ["add", "source.txt"]);
		await commit(workspace, "agent change");
		await writeFile(join(workspace, "notes.txt"), "one\ntwo\n");
		await writeFile(join(repository, "upstream.txt"), "upstream\n");
		await git(repository, ["add", "upstream.txt"]);
		await commit(repository, "upstream change");

		expect(await readWorkspace({ runId: run.id, workspace, scratch: false })).toEqual({
			runId: run.id,
			directory: workspace,
			state: "ready",
			branch: "trellis/session-01m2pt14njds107b4tgk6pnfda",
			head: await git(workspace, ["rev-parse", "--short", "HEAD"]),
			base: "main",
			ahead: 1,
			behind: 1,
			files: 2,
			additions: 3,
			deletions: 1,
			uncommitted: 1,
		});
	});

	test("reports no branch on a detached HEAD and no base for a detached source", async () => {
		const root = await createRoot();
		const repository = await createRepository(root);
		await git(repository, ["checkout", "--detach"]);
		const workspace = await nativeWorkspace(join(root, "home"), run, repository);
		await git(workspace, ["checkout", "--detach"]);

		expect(await readWorkspace({ runId: run.id, workspace, scratch: false })).toMatchObject({
			branch: null,
			base: null,
			ahead: 0,
			behind: 0,
			files: 0,
			uncommitted: 0,
		});
	});

	test("counts a scratch repository from its first commit", async () => {
		const root = await createRoot();
		const workspace = await createSessionRepository(join(root, "sessions", "scratch"));
		await writeFile(join(workspace, "draft.txt"), "one\ntwo\n");
		await git(workspace, ["add", "draft.txt"]);
		await commit(workspace, "draft");
		await writeFile(join(workspace, "draft.txt"), "one\ntwo\nthree\n");

		expect(await readWorkspace({ runId: run.id, workspace, scratch: true })).toMatchObject({
			branch: "main",
			base: null,
			ahead: 1,
			behind: 0,
			files: 1,
			additions: 3,
			deletions: 0,
			uncommitted: 1,
		});
	});

	test("reports a directory that is not on disk as missing", async () => {
		const root = await createRoot();
		const workspace = join(root, "gone");

		expect(await summarizeWorkspace({ runId: run.id, workspace, scratch: true })).toEqual({
			runId: run.id,
			directory: workspace,
			state: "missing",
		});
	});

	test("reports a workspace whose base branch is gone as unreadable", async () => {
		const root = await createRoot();
		const repository = await createRepository(root);
		await git(repository, ["branch", "-m", "main", "renamed"]);
		const workspace = await nativeWorkspace(join(root, "home"), run, repository);
		await git(repository, ["branch", "-m", "renamed", "main"]);

		const result = await summarizeWorkspace({ runId: run.id, workspace, scratch: false });
		expect(result.state).toBe("unreadable");
	});

	test("shares one read between two calls for the same workspace", async () => {
		const root = await createRoot();
		const workspace = await createSessionRepository(join(root, "sessions", "scratch"));
		const [first, second] = await Promise.all([
			summarizeWorkspace({ runId: run.id, workspace, scratch: true }),
			summarizeWorkspace({ runId: run.id, workspace, scratch: true }),
		]);

		expect(first).toBe(second);
	});
});
