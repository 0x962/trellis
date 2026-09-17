import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../../deps";

const pr = "owner/repo#12";
const sources: string[] = [];
afterEach(async () => {
	for (const source of sources.splice(0)) await rm(source, { recursive: true, force: true });
});
test("review add sends stdin, range, side, and explicit identity", async () => {
	const result = await runCli(
		[
			"review",
			"add",
			pr,
			"--path",
			"a.ts",
			"--start-line",
			"2",
			"--line",
			"4",
			"--side",
			"old",
			"--author",
			"checker",
			"--session",
			"review-session",
			"--body",
			"-",
		],
		{ "reviews.add": { id: "thread" } },
		{ stdin: "Body\nNext line" },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]?.input).toMatchObject({
		pr,
		path: "a.ts",
		line: 4,
		startLine: 2,
		side: "old",
		body: "Body\nNext line",
	});
	expect(result.requests[0]?.headers.get("x-trellis-session")).toBe("review-session");
	expect(result.requests[0]?.headers.get("x-trellis-actor")).toBe("agent:checker");
});
test("review submit sends a GitHub review for the current head", async () => {
	const selected = await runCli(["review", "submit", pr, "--verdict", "approve"], {
		"reviews.status": { headRefOid: "abc123" },
		"reviews.submit": { id: "pull-request" },
	});
	expect(selected.code).toBe(0);
	expect(selected.calls[1]?.input).toEqual({ pr, headSha: "abc123", body: "", verdict: "approve" });
});
test("review list supports JSON lines", async () => {
	const result = await runCli(["review", "list", pr, "--jsonl"], {
		"reviews.list": { items: [{ id: "a" }, { id: "b" }], total: 2, open: 2 },
	});
	expect(result.stdout).toBe('{"id":"a"}\n{"id":"b"}\n');
});
// The URL of the local page comes from the same parser the web uses, and
// that parser throws a plain Error for a reference it cannot read.
test("review open prints one line for a reference it cannot read", async () => {
	const result = await runCli(["review", "open", "not a pull request"], { "reviews.open": {} });
	expect(result.code).toBe(2);
	expect(result.stderr).toBe("error: Use a GitHub PR URL or owner/repo#123. (USAGE)\n");
});
test("review import-margin names a directory that holds no comments", async () => {
	const source = join(process.env.TRELLIS_TEST_ROOT!, "no-such-margin-home");
	const result = await runCli(["review", "import-margin", "--from", source], {});
	expect(result.code).toBe(3);
	expect(result.stderr).toBe(`error: No file at ${source}. (NOT_FOUND)\n`);
	expect(result.calls).toHaveLength(0);
});
test("review import-margin names the file and the first issue of a file of another shape", async () => {
	const source = await mkdtemp(join(process.env.TRELLIS_TEST_ROOT!, "trellis-margin-"));
	sources.push(source);
	const path = join(source, "one.json");
	await writeFile(path, JSON.stringify({ url: "owner/repo#12", comments: [{ id: "c1" }] }));
	const result = await runCli(["review", "import-margin", "--from", source], {});
	expect(result.code).toBe(2);
	expect(result.stderr).toStartWith(`error: ${path} is not a margin comment file. comments.0.`);
	expect(result.stderr).toEndWith("(USAGE)\n");
	expect(result.calls).toHaveLength(0);
});
