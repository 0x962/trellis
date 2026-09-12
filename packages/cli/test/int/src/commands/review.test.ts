import { expect, test } from "bun:test";
import { runCli } from "../../../deps";

const pr = "owner/repo#12";
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
test("review submit requires an explicit notification choice", async () => {
	const missing = await runCli(["review", "submit", pr], {});
	expect(missing.code).not.toBe(0);
	expect(missing.calls).toHaveLength(0);
	const selected = await runCli(["review", "submit", pr, "--no-notify", "--threads", "one,two"], {
		"reviews.submit": { id: "review" },
	});
	expect(selected.code).toBe(0);
	expect(selected.calls[0]?.input).toMatchObject({ recipients: [], threadIds: ["one", "two"] });
});
test("review list supports JSON lines", async () => {
	const result = await runCli(["review", "list", pr, "--jsonl"], {
		"reviews.list": { items: [{ id: "a" }, { id: "b" }], total: 2, open: 2 },
	});
	expect(result.stdout).toBe('{"id":"a"}\n{"id":"b"}\n');
});
