import { expect, test } from "bun:test";
import { runCli } from "../../test/deps.ts";
import { comment, commentId } from "../../test/fixtures.ts";

test("comment sends a reply with its thread identifier", async () => {
	const result = await runCli(
		["comment", "CDE-42", "--reply-to", commentId, "--body", "-"],
		{ "comments.create": comment() },
		{ stdin: "I checked this." },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({
		path: "comments.create",
		input: {
			ticket: "CDE-42",
			body: "I checked this.",
			parentId: commentId,
		},
	});
});

test("thread show returns the root and its replies", async () => {
	const root = comment();
	const result = await runCli(["thread", "show", commentId], { "comments.thread": { root, replies: [] } });
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({ path: "comments.thread", input: { id: commentId } });
	expect(JSON.parse(result.stdout)).toEqual({ root, replies: [] });
});

for (const [verb, resolved] of [
	["resolve", true],
	["reopen", false],
] as const) {
	test(`thread ${verb} changes the resolution`, async () => {
		const result = await runCli(["thread", verb, commentId], { "comments.resolve": comment() });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "comments.resolve", input: { id: commentId, resolved } });
	});
}

test("comments prints reply identifiers and resolved state for terminal readers", async () => {
	const root = { ...comment(), resolvedAt: "2026-09-10T00:00:00.000Z", parentId: null };
	const reply = { ...comment(), id: "01J8Z6X4Q3M2K1H0G9F8E7D6C2", parentId: commentId, resolvedAt: null };
	const result = await runCli(
		["comments", "CDE-42"],
		{
			"timeline.list": { items: [reply, root], nextCursor: null },
		},
		{ tty: true },
	);
	expect(result.code).toBe(0);
	expect(result.stdout).toContain(`${commentId} [resolved]`);
	expect(result.stdout).toContain(`reply to ${commentId}`);
	expect(result.stdout).toContain(reply.id);
});

test("instructions explain how agents read, reply to, and resolve a thread", async () => {
	const result = await runCli(["instructions", "--project", "CDE"]);
	for (const command of ["comment CDE-42 --reply-to", "thread show", "thread resolve", "thread reopen"]) {
		expect(result.stdout).toContain(command);
	}
});
