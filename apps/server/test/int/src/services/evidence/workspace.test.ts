import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revision } from "../../../../../src/services/evidence/revision.ts";
import { safeFile } from "../../../../../src/services/evidence/safeFile.ts";

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
const repository = async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-evidence-"));
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

test("working tree bytes invalidate evidence without a HEAD change", async () => {
	const root = await repository();
	const before = await revision(root);
	await writeFile(join(root, "code.ts"), "export const value = 2;\n");
	const changed = await revision(root);
	expect(changed.head).toBe(before.head);
	expect(changed.fingerprint).not.toBe(before.fingerprint);
	await writeFile(join(root, "new file.txt"), "untracked content\n");
	expect((await revision(root)).fingerprint).not.toBe(changed.fingerprint);
	await mkdir(join(root, "ignored"));
	const beforeIgnored = await revision(root);
	await writeFile(join(root, "ignored", "output.txt"), "ignored output");
	expect((await revision(root)).fingerprint).toBe(beforeIgnored.fingerprint);
});

test("workspace files reject absolute paths, traversal, and symlink escape", async () => {
	const root = await repository();
	const outside = await mkdtemp(join(tmpdir(), "trellis-evidence-outside-"));
	directories.push(outside);
	await writeFile(join(outside, "secret.txt"), "outside");
	await symlink(outside, join(root, "escape"));
	await expect(safeFile(root, "../secret.txt")).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(safeFile(root, join(outside, "secret.txt"))).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(safeFile(root, "escape/secret.txt")).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(await safeFile(root, "code.ts")).toBe(await realpath(join(root, "code.ts")));
	expect((await revision(root)).files.find((file) => file.path === "escape")?.kind).toBe("symlink");
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
	expect((await revision(root)).files.find((file) => file.path === "nested/tracked.txt")?.kind).toBe("missing");
});

test("the file hash does not follow a replacement leaf symlink", async () => {
	const root = await repository();
	await symlink(join(root, "code.ts"), join(root, "link.txt"));
	const { hashFile } = await import("../../../../../src/services/evidence/hashFile.ts");
	await expect(hashFile(join(root, "link.txt"))).rejects.toMatchObject({ code: "ELOOP" });
});
