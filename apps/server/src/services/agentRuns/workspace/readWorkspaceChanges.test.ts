import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { tempDirs } from "../../../tempDir.ts";
import { readWorkspaceChanges } from "./readWorkspaceChanges.ts";

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

const readAll = async (repository: string) => {
	const files: { path: string; status: string }[] = [];
	let diff = "";
	let cursor: string | undefined;
	do {
		const page = await readWorkspaceChanges(repository, cursor);
		files.push(...page.files);
		diff += page.diff;
		cursor = page.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return { files, diff };
};

describe("workspace changes", () => {
	test("returns a complete large UTF-8 patch through ordered pages", async () => {
		const repository = await createRepository();
		await writeFile(join(repository, "source.txt"), `${"界".repeat(300_000)}\nEND-完全\n`);
		const expected = await exec("git", ["-C", repository, "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"], {
			maxBuffer: 4 * 1024 * 1024,
		});

		const result = await readAll(repository);

		expect(result.diff.length).toBeGreaterThan(262_144);
		expect(result.diff).toBe(expected.stdout);
	}, 30_000);

	test("returns every path in a large ordered file list", async () => {
		const repository = await createRepository();
		const paths = Array.from(
			{ length: 3_000 },
			(_, index) => `change-${index.toString().padStart(4, "0")}-${"x".repeat(100)}.txt`,
		);
		expect(paths.join("").length).toBeGreaterThan(262_144);
		await Promise.all(paths.map((path) => writeFile(join(repository, path), path)));

		const result = await readAll(repository);

		expect(result.files.map((file) => file.path)).toEqual([...paths, "source.txt"]);
		expect(result.files.at(-2)).toEqual({ path: paths.at(-1)!, status: "??" });
	}, 60_000);

	test("preserves U+FEFF at the start of a modified path", async () => {
		const repository = await createRepository();
		const path = "\uFEFFreport.txt";
		await writeFile(join(repository, path), "base\n");
		await exec("git", ["-C", repository, "add", path]);
		await exec("git", [
			"-C",
			repository,
			"-c",
			"user.name=Trellis Test",
			"-c",
			"user.email=trellis@example.com",
			"commit",
			"-m",
			"add report",
		]);
		await writeFile(join(repository, path), "changed\n");

		const result = await readAll(repository);

		expect(result.files.find((file) => file.path === path)).toEqual({ path, status: " M" });
	});

	test("rejects a cursor after the workspace changes", async () => {
		const repository = await createRepository();
		await writeFile(join(repository, "source.txt"), "changed\n");
		const first = await readWorkspaceChanges(repository);
		expect(first.nextCursor).not.toBeNull();
		await writeFile(join(repository, "source.txt"), "changed again\n");

		await expect(readWorkspaceChanges(repository, first.nextCursor!)).rejects.toThrow(
			"The workspace changed. Start again without a cursor.",
		);
	});
});
