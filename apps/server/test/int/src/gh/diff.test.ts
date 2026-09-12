import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { PullRequestDiffOutputSchema } from "@trellis/api";
import { fetchDiff } from "../../../../src/gh/diff.ts";
import { createGhRunner } from "../../../../src/gh/run.ts";
import { ghStub } from "../../../helpers/gh-stub.ts";

// `gh pr diff <url>` runs on the interactive slot. A diff over 1 MB is cut at
// 1 MB and marked truncated; `url` opens the whole diff on GitHub.
const scratch = () => mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-diff-"));
const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Parameters<typeof ghStub>[1]) => {
	const handle = ghStub(scratch(), replies);
	restores.push(handle.restore);
	return handle;
};

const url = "https://github.com/acme/web/pull/100";
const megabyte = 1_048_576;
// An ASCII diff of exactly `bytes` bytes, so byte length and string length agree.
const diffOf = (bytes: number) => {
	const header = "diff --git a/f b/f\n";
	return header + "+".repeat(bytes - header.length);
};

describe("fetchDiff", () => {
	test("returns the whole diff under 1 MB with truncated false", async () => {
		const diff = diffOf(300);
		const handle = stub({ "pr diff": { stdout: diff, stderr: "", exitCode: 0 } });
		const result = await fetchDiff(createGhRunner(), url);
		expect(result).toMatchObject({ ok: true, diff, truncated: false, url });
		expect(handle.spawns()).toHaveLength(1);
		expect(handle.spawns()[0]!.args).toEqual(["pr", "diff", url]);
	});

	test("cuts a diff over 1 MB and returns truncated true with the url", async () => {
		const diff = diffOf(megabyte + 10);
		stub({ "pr diff": { stdout: diff, stderr: "", exitCode: 0 } });
		const result = (await fetchDiff(createGhRunner(), url)) as { diff: string; truncated: boolean; url: string };
		expect(Buffer.byteLength(result.diff)).toBe(megabyte);
		expect(result.diff).toBe(diff.slice(0, megabyte));
		expect(result.truncated).toBe(true);
		expect(result.url).toBe(url);
		expect(PullRequestDiffOutputSchema.safeParse(result).success).toBe(true);
	});

	test("a diff of exactly 1 MB is not truncated", async () => {
		const diff = diffOf(megabyte);
		stub({ "pr diff": { stdout: diff, stderr: "", exitCode: 0 } });
		const result = await fetchDiff(createGhRunner(), url);
		expect(result).toMatchObject({ ok: true, diff, truncated: false, url });
	});

	test("diff uses the interactive slot", async () => {
		const handle = stub({
			"auth status": { stdout: "ok", stderr: "", exitCode: 0, delayMs: 300 },
			"pr diff": { stdout: diffOf(300), stderr: "", exitCode: 0 },
		});
		const runGh = createGhRunner();
		const pollers = [runGh("poller", ["auth", "status"]), runGh("poller", ["auth", "status"])];
		let settled = 0;
		for (const poller of pollers) poller.then(() => settled++);
		await Bun.sleep(100);
		const fetching = fetchDiff(runGh, url);
		await Bun.sleep(100);
		expect(handle.spawns().map((spawn) => spawn.args[0])).toEqual(["auth", "auth", "pr"]);
		expect(settled).toBe(0);
		await Promise.all([...pollers, fetching]);
	});

	test("returns the run failure when gh pr diff fails", async () => {
		stub({
			"pr diff": { stdout: "", stderr: "To get started with GitHub CLI, please run: gh auth login", exitCode: 1 },
		});
		const result = await fetchDiff(createGhRunner(), url);
		expect(result).toMatchObject({ ok: false, reason: "unauthenticated" });
		expect(result).not.toHaveProperty("diff");
	});
});
