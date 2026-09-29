import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { tempDirs } from "../../../tempDir.ts";
import { git } from "./git.ts";

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
	test("reads output above 16 MiB", async () => {
		const repository = await createRepository();
		const size = 16 * 1024 * 1024 + 1;
		await writeFile(join(repository, "large.txt"), Buffer.alloc(size, 120));
		await exec("git", ["-C", repository, "add", "large.txt"]);

		const output = await git(repository, ["show", ":large.txt"]);

		expect(Buffer.byteLength(output)).toBe(size);
		expect(output.at(-1)).toBe("x");
	});

	test("rejects a failed process that writes a partial patch", async () => {
		const repository = await createRepository();
		await writeFile(join(repository, "left.txt"), "left\n");
		await writeFile(join(repository, "right.txt"), "right\n");

		await expect(git(repository, ["diff", "--no-index", "left.txt", "right.txt"])).rejects.toThrow(
			"git diff stopped with code 1",
		);
	});
});
