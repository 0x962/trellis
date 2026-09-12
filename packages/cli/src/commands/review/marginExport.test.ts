import { expect, test } from "bun:test";
import { marginExport } from "./marginExport";

test("exports current messages with legacy aliases and all Margin fields", () => {
	const date = "2026-09-12T00:00:00.000Z";
	const message = {
		id: "root",
		author: "Reviewer",
		kind: "agent" as const,
		session: "session",
		body: "Edited after import",
		createdAt: date,
		updatedAt: date,
		version: 2,
		reactions: [{ reaction: "+1" as const, author: "Human", kind: "human" as const }],
	};
	const result = marginExport({
		url: "https://github.com/owner/repo/pull/1",
		threads: [
			{
				...message,
				prId: "pr",
				path: "a.ts",
				side: "old",
				startLine: 9,
				line: 3,
				revisionId: null,
				status: "resolved",
				resolvedBy: "Builder",
				resolvedAt: date,
				replies: [{ ...message, id: "reply", body: "Fixed", session: null }],
			},
		],
		imports: [{ id: "root", legacy_id: "c-old" }],
	});
	expect(result.comments[0]).toMatchObject({
		id: "c-old",
		body: "Edited after import",
		startLine: 9,
		line: 3,
		side: "old",
		session: "session",
		resolvedBy: "Builder",
		resolvedAt: date,
		replies: [{ id: "r-reply", body: "Fixed" }],
	});
	expect(result.comments[0]).not.toHaveProperty("reactions");
	expect(result.comments[0]?.replies[0]).not.toHaveProperty("session");
});
