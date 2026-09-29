import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { tempDirs } from "../../../tempDir.ts";
import { git } from "./git.ts";
import { gitTextPage } from "./gitTextPage.ts";

const tempDir = tempDirs();
const exec = promisify(execFile);

const createRepository = async () => {
	const root = await tempDir("trellis-workspace-git-");
	const repository = join(root, "repository");
	await mkdir(repository);
	await exec("git", ["-C", repository, "init", "--initial-branch=main"]);
	return repository;
};

describe("workspace git", () => {
	test("reads one bounded page from output above 16 MiB", async () => {
		const repository = await createRepository();
		const size = 16 * 1024 * 1024 + 1;
		await writeFile(join(repository, "large.txt"), Buffer.alloc(size, 120));
		await exec("git", ["-C", repository, "add", "large.txt"]);

		const output = await gitTextPage(repository, ["show", ":large.txt"], { offset: 0, limit: 1024 });

		expect(Buffer.byteLength(output.text)).toBe(1024);
		expect(output.nextOffset).toBe(1024);
		expect(output.totalBytes).toBe(size);
	});

	test("rejects a failed process that writes a partial patch", async () => {
		const repository = await createRepository();
		await writeFile(join(repository, "left.txt"), "left\n");
		await writeFile(join(repository, "right.txt"), "right\n");

		await expect(
			gitTextPage(repository, ["diff", "--no-index", "left.txt", "right.txt"], { offset: 0, limit: 1024 }),
		).rejects.toThrow("git diff stopped with code 1");
	});

	test("preserves U+FEFF at the start of a path", async () => {
		const repository = await createRepository();
		const path = "\uFEFFreport.txt";
		await writeFile(join(repository, path), "report\n");
		await exec("git", ["-C", repository, "add", path]);

		expect(await git(repository, ["ls-files", "-z"])).toBe(`${path}\0`);
	});
});
