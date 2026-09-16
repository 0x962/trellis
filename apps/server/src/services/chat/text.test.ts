import { expect, test } from "bun:test";
import { chatBatchText, chatLine, type PendingLine } from "./text.ts";

const line = (overrides: Partial<PendingLine> = {}): PendingLine => ({
	messageId: "01J8Z6X4Q3M2K1H0G9F8E7D6M1",
	channel: "ai",
	body: "rebase on main",
	actorName: "01J8Z6X4Q3M2K1H0G9F8E7D6G1",
	actorKind: "agent",
	actorDisplayName: "Builder",
	createdAt: "2026-09-09T12:34:56.000Z",
	...overrides,
});

test("a line is the channel, the clock, the nick, and the body", () => {
	expect(chatLine(line())).toBe("#ai 12:34:56 <Builder 01J8Z6X4Q3M2K1H0G9F8E7D6G1> rebase on main");
	expect(chatLine(line({ actorKind: "human", actorName: "dana", actorDisplayName: null }))).toBe(
		"#ai 12:34:56 <dana> rebase on main",
	);
});

test("a worker batch holds every line and the two commands", () => {
	const text = chatBatchText({ runId: "r", personaName: "Reviewer", kind: "reviewer", projectPath: "TRL.web" }, [
		line(),
		line({ channel: "general", body: "second" }),
	]);
	expect(text.split("\n")).toEqual([
		"trellis chat: 2 new messages in the TRL.web room.",
		"#ai 12:34:56 <Builder 01J8Z6X4Q3M2K1H0G9F8E7D6G1> rebase on main",
		"#general 12:34:56 <Builder 01J8Z6X4Q3M2K1H0G9F8E7D6G1> second",
		'Reply: trellis chat post TRL.web <channel> --body "..." Read more: trellis chat read TRL.web <channel>',
	]);
});

test("a manager batch is one JSON document", () => {
	const text = chatBatchText({ runId: "m", personaName: "Trellis", kind: "manager", projectPath: "TRL" }, [line()]);
	expect(JSON.parse(text)).toEqual({
		type: "trellis.chat.messages",
		project: "TRL",
		messages: [
			{
				id: "01J8Z6X4Q3M2K1H0G9F8E7D6M1",
				channel: "ai",
				body: "rebase on main",
				createdAt: "2026-09-09T12:34:56.000Z",
				actor: { kind: "agent", name: "01J8Z6X4Q3M2K1H0G9F8E7D6G1", displayName: "Builder" },
			},
		],
		recipient: { runId: "m", personaName: "Trellis" },
	});
});
