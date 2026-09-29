import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDirs } from "../../../tempDir.ts";
import { safeFile } from "./safeFile.ts";

const tempDir = tempDirs();

describe("safe workspace file", () => {
	test("rejects a parent path", async () => {
		const root = await tempDir("trellis-safe-workspace-");
		const workspace = join(root, "workspace");
		await mkdir(workspace);

		await expect(safeFile(workspace, "../outside.txt")).rejects.toThrow(
			"Use a relative path inside this agent workspace.",
		);
	});

	test("rejects a symlink that leaves the workspace", async () => {
		const root = await tempDir("trellis-safe-workspace-");
		const workspace = join(root, "workspace");
		const outside = join(root, "outside.txt");
		await mkdir(workspace);
		await writeFile(outside, "outside\n");
		await symlink(outside, join(workspace, "link.txt"));

		await expect(safeFile(workspace, "link.txt")).rejects.toThrow(
			"This path leaves the agent workspace through a symlink.",
		);
	});
});
