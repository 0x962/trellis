import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { activity, comment, commentId, timeline } from "../../../fixtures.ts";

describe("comment", () => {
	test("comment passes a stable deduplication key", async () => {
		const result = await runCli(
			["comment", "CDE-42", "--body", "Decision required", "--dedupe-key", "release:revision-1"],
			{ "comments.create": comment() },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({
			ticket: "CDE-42",
			body: "Decision required",
			dedupeKey: "release:revision-1",
		});
	});
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

	// CLI-96: the timeline pages. A page of activity rows can hold no comment
	// at all, so every page follows the cursor of the answer before it.
	test("comments reads every timeline page", async () => {
		const first = { items: [activity({ id: 9 })], nextCursor: "t1" };
		const second = { items: [comment()], nextCursor: null };
		const result = await runCli(
			["comments", "CDE-42"],
			{ "timeline.list": (input: { before?: string }) => (input.before === undefined ? first : second) },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => (call.input as { before?: string }).before)).toEqual([undefined, "t1"]);
		expect(result.stdout).toContain("Body A");
	});
});

test("comment output shows the persona and preserves the internal actor in JSON", async () => {
	const row = comment({ actor: { name: "agent-537", kind: "agent", displayName: "Builder" } });
	const result = await runCli(
		["comments", "CDE-42"],
		{ "timeline.list": { items: [row], nextCursor: null } },
		{ tty: true },
	);
	expect(result.stdout).toContain("agent:Builder");
	expect(result.stdout).not.toContain("agent-537");
	const json = await runCli(["comments", "CDE-42", "--json"], { "timeline.list": { items: [row], nextCursor: null } });
	expect(JSON.parse(json.stdout)[0].actor.name).toBe("agent-537");
});
