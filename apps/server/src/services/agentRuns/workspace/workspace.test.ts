import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { tempDirs } from "../../../tempDir.ts";
import { readWorkspaceChanges } from "./workspace.ts";

const tempDir = tempDirs();
const exec = promisify(execFile);

const createRepository = async () => {
	const root = await tempDir("trellis-workspace-read-");
	const repository = join(root, "repository");
	await mkdir(repository);
	await exec("git", ["-C", repository, "init", "--initial-branch=main"]);
	await writeFile(join(repository, "source.txt"), "base\n");
	await exec("git", ["-C", repository, "add", "source.txt"]);
	await exec("git", [
		"-C",
		repository,
		"-c",
		"user.name=Trellis Test",
		"-c",
		"user.email=trellis@example.com",
		"commit",
		"-m",
		"base",
	]);
	return repository;
};

describe("workspace changes", () => {
	test("returns a complete large UTF-8 patch", async () => {
		const repository = await createRepository();
		await writeFile(join(repository, "source.txt"), `${"界".repeat(300_000)}\nEND-完全\n`);

		const result = await readWorkspaceChanges(repository);

		expect(result.diff.length).toBeGreaterThan(262_144);
		expect(result.diff).toContain("END-完全");
		expect(result.truncated).toBe(false);
	}, 30_000);

	test("returns every path in a large ordered file list", async () => {
		const repository = await createRepository();
		const paths = Array.from(
			{ length: 2_000 },
			(_, index) => `change-${index.toString().padStart(4, "0")}-${"x".repeat(100)}.txt`,
		);
		await Promise.all(paths.map((path) => writeFile(join(repository, path), path)));

		const result = await readWorkspaceChanges(repository);

		expect(result.files.map((file) => file.path)).toEqual([...paths, "source.txt"]);
		expect(result.files.at(-2)).toEqual({ path: paths.at(-1)!, status: "??" });
	}, 30_000);
});
