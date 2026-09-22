import { expect, test } from "bun:test";
import type { ResourceCommentThread } from "@trellis/api";
import { printThreads } from "./resourceCommentText.ts";

const thread = (fields: Partial<ResourceCommentThread>): ResourceCommentThread => ({
	id: "01M33HDDHHYS14KKBDFQZJEGV1",
	resourceId: "01M33HDDHHYS14KKBDFQZJEGV0",
	anchor: { quote: "the second\nline", prefix: "", suffix: "" },
	textRemoved: false,
	resolved: null,
	comments: [
		{
			id: "01M33HDDHHYS14KKBDFQZJEGV1",
			body: "Is this\ntrue?",
			actor: { name: "dana", kind: "human" },
			createdAt: "2026-09-21T10:00:00.000Z",
			updatedAt: "2026-09-21T10:00:00.000Z",
		},
		{
			id: "01M33HDDHHYS14KKBDFQZJEGV2",
			body: "Yes.",
			actor: { name: "01M33HDDHHYS14KKBDFQZJEGVY", kind: "agent", displayName: "crisp-fjord" },
			createdAt: "2026-09-21T10:01:00.000Z",
			updatedAt: "2026-09-21T10:01:00.000Z",
		},
	],
	...fields,
});

const printed = (threads: ResourceCommentThread[]) => {
	let text = "";
	printThreads({ write: (chunk) => (text += chunk) }, { mode: "table", color: false }, threads);
	return text;
};

test("prints each thread with its state, its quoted text on one line, and its comments under it", () => {
	expect(
		printed([
			thread({}),
			thread({ id: "01M33HDDHHYS14KKBDFQZJEGV3", textRemoved: true, comments: [thread({}).comments[0]!] }),
		]),
	).toBe(
		[
			"thread                      state         quote            comments",
			"01M33HDDHHYS14KKBDFQZJEGV1  open          the second line  2",
			"  dana: Is this true?",
			"  crisp-fjord: Yes.",
			"01M33HDDHHYS14KKBDFQZJEGV3  text removed  the second line  1",
			"  dana: Is this true?",
			"",
		].join("\n"),
	);
});

test("names a resolved thread resolved, even when its text is gone", () => {
	const resolved = { actor: { name: "dana", kind: "human" as const }, at: "2026-09-21T10:02:00.000Z" };
	expect(printed([thread({ textRemoved: true, resolved })]).split("\n")[1]).toContain("resolved");
});
