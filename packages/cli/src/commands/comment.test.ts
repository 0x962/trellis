import { describe, expect, test } from "bun:test";
import { runCli } from "../../test/deps.ts";
import { comment, commentId, timeline } from "../../test/fixtures.ts";

describe("comment", () => {
	// CLI-95
	test("comment maps --body and stdin", async () => {
		const flagged = await runCli(["comment", "CDE-42", "--body", "Done"], { "comments.create": comment() });
		expect(flagged.code).toBe(0);
		expect(flagged.calls[0]).toMatchObject({ path: "comments.create" });
		expect(flagged.calls[0]!.input).toEqual({ ticket: "CDE-42", body: "Done" });

		const piped = await runCli(
			["comment", "CDE-42", "--body", "-"],
			{ "comments.create": comment() },
			{
				stdin: "Done, see PR\nsecond line",
			},
		);
		expect(piped.calls[0]!.input).toEqual({ ticket: "CDE-42", body: "Done, see PR\nsecond line" });

		const quiet = await runCli(["comment", "CDE-42", "--body", "Done", "--quiet"], { "comments.create": comment() });
		expect(quiet.stdout).toBe(`${commentId}\n`);
	});
});

describe("comments", () => {
	// CLI-96: the timeline arrives newest first; a reader wants the thread
	// oldest first, so the comment items print in reverse.
	test("comments lists the comment items of the timeline", async () => {
		const result = await runCli(
			["comments", "CDE-42", "--limit", "10"],
			{ "timeline.list": timeline() },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "timeline.list" });
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42", limit: 10 });
		expect(result.stdout).toContain("Body A");
		expect(result.stdout).toContain("Body B");
		expect(result.stdout.indexOf("Body A")).toBeLessThan(result.stdout.indexOf("Body B"));
		expect(result.stdout).not.toContain("human-review");
	});
});
