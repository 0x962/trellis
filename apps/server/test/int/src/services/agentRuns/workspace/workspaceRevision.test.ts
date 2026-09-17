import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ORPCError } from "@orpc/server";
import { workspaceRevision } from "../../../../../../src/services/agentRuns/workspace/workspaceRevision.ts";

type Refusal = ORPCError<string, { issues: { message: string; path: string[] }[] }>;

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

const directory = async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-workspace-"));
	directories.push(root);
	return root;
};

const refusal = (root: string) =>
	workspaceRevision(root).then(
		() => null,
		(thrown: unknown) => thrown as Refusal,
	);

test("a workspace that Git cannot read refuses the request with the Git text", async () => {
	const root = await directory();

	const failed = await refusal(root);

	expect(failed?.code).toBe("INPUT_VALIDATION_FAILED");
	expect(failed?.status).toBe(400);
	expect(failed?.message).toContain("not a git repository");
	expect(failed?.data.issues).toEqual([{ message: failed!.message, path: ["workspace"] }]);
});

test("a workspace that Git reads answers its files", async () => {
	const root = await directory();
	execFileSync("git", ["init", "-q", root]);
	await writeFile(join(root, "code.ts"), "export const value = 1;\n");
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

	const state = await workspaceRevision(root);

	expect(state.files.map((file) => file.path)).toEqual(["code.ts"]);
});
