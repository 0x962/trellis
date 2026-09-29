import { expect, test } from "bun:test";
import { workspaceCommit } from "./workspaceCommit";

test("reads the full current workspace commit", async () => {
	const result = await workspaceCommit("/fixture/work", async (file, args) => {
		expect(file).toBe("git");
		expect(args).toEqual(["-C", "/fixture/work", "rev-parse", "--verify", "--quiet", "HEAD"]);
		return { stdout: `${"a".repeat(40)}\n` };
	});
	expect(result).toBe("a".repeat(40));
});

test("keeps an absent revision unknown", async () => {
	expect(
		await workspaceCommit("/fixture/work", async () => {
			throw { code: 1 };
		}),
	).toBeNull();
});

test("preserves Git failures that do not mean an absent revision", async () => {
	for (const code of ["ENOENT", "EACCES", 128]) {
		const failure = Object.assign(new Error("Git failed"), { code });
		await expect(
			workspaceCommit("/fixture/work", async () => {
				throw failure;
			}),
		).rejects.toBe(failure);
	}
});
