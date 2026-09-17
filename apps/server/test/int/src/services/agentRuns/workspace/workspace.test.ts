import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revision } from "../../../../../../src/services/agentRuns/workspace/revision.ts";
import { safeFile } from "../../../../../../src/services/agentRuns/workspace/safeFile.ts";

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
const repository = async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-workspace-"));
	directories.push(root);
	execFileSync("git", ["init", "-q", root]);
	await writeFile(join(root, "code.ts"), "export const value = 1;\n");
	await writeFile(join(root, ".gitignore"), "ignored/\n");
	execFileSync("git", ["-C", root, "add", "."]);
	execFileSync("git", [
		"-C",
		root,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"-qm",
		"Fixture",
	]);
	return root;
};

test("workspace files include tracked and untracked paths", async () => {
	const root = await repository();
	await writeFile(join(root, "code.ts"), "export const value = 2;\n");
	await writeFile(join(root, "new file.txt"), "untracked content\n");
	await mkdir(join(root, "ignored"));
	await writeFile(join(root, "ignored", "output.txt"), "ignored output");
	expect((await revision(root)).files).toEqual([
		{ path: ".gitignore", status: "  " },
		{ path: "code.ts", status: " M" },
		{ path: "new file.txt", status: "??" },
	]);
});

test("workspace files reject absolute paths, traversal, and symlink escape", async () => {
	const root = await repository();
	const outside = await mkdtemp(join(tmpdir(), "trellis-workspace-outside-"));
	directories.push(outside);
	await writeFile(join(outside, "secret.txt"), "outside");
	await symlink(outside, join(root, "escape"));
	await expect(safeFile(root, "../secret.txt")).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(safeFile(root, join(outside, "secret.txt"))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(safeFile(root, "escape/secret.txt")).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(await safeFile(root, "code.ts")).toBe(await realpath(join(root, "code.ts")));
	expect((await revision(root)).files).toContainEqual({ path: "escape", status: "??" });
});

test("a deleted tracked directory remains inspectable", async () => {
	const root = await repository();
	await mkdir(join(root, "nested"));
	await writeFile(join(root, "nested", "tracked.txt"), "tracked");
	execFileSync("git", ["-C", root, "add", "."]);
	execFileSync("git", [
		"-C",
		root,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"-qm",
		"Nested",
	]);
	await rm(join(root, "nested"), { recursive: true });
	expect((await revision(root)).files).toContainEqual({ path: "nested/tracked.txt", status: " D" });
});
