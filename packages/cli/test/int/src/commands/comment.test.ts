import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../deps.ts";
import { activity, attachment, attachmentId, comment, commentId, timeline } from "../../../fixtures.ts";

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);

const tempFile = () => {
	const dir = mkdtempSync(join(tmpdir(), "trellis-comment-attach-"));
	const path = join(dir, "shot.png");
	writeFileSync(path, bytes);
	return path;
};

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

	test("comment --attach uploads the file and links it to the comment", async () => {
		const path = tempFile();
		const result = await runCli(
			["comment", "CDE-42", "--body", "See this", "--attach", path],
			{
				"attachments.upload": {
					attachment: attachment(),
					url: attachment().url,
					markdown: `![shot.png](${attachment().url})`,
				},
				"comments.create": comment(),
			},
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["attachments.upload", "comments.create"]);
		const uploaded = result.calls[0]!.input as { ticket: string; file: File };
		expect(uploaded.ticket).toBe("CDE-42");
		expect(uploaded.file).toBeInstanceOf(File);
		expect(new Uint8Array(await uploaded.file.arrayBuffer())).toEqual(bytes);
		expect(result.calls[1]!.input).toMatchObject({
			ticket: "CDE-42",
			body: "See this",
			attachmentIds: [attachmentId],
		});
		expect(result.stdout).toContain(`Attached cover.png (2.0 KB) -> ${attachment().url}`);
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

test("comments list shows the files a comment illustrates", async () => {
	const row = comment({ attachments: [attachment()] });
	const result = await runCli(
		["comments", "CDE-42"],
		{ "timeline.list": { items: [row], nextCursor: null } },
		{ tty: true },
	);
	expect(result.code).toBe(0);
	expect(result.stdout).toContain(`cover.png -> ${attachment().url}`);
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
