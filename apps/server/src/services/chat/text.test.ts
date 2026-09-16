import { expect, test } from "bun:test";
import { chatBatchText, chatLine, type PendingLine } from "./text.ts";

const line = (overrides: Partial<PendingLine> = {}): PendingLine => ({
	messageId: "01J8Z6X4Q3M2K1H0G9F8E7D6M1",
	direct: false,
	channel: "ai",
	body: "rebase on main",
	actorName: "01J8Z6X4Q3M2K1H0G9F8E7D6G1",
	actorKind: "agent",
	actorDisplayName: "Builder",
	createdAt: "2026-09-09T12:34:56.000Z",
	...overrides,
});

test("a line is the channel, the clock, the nick, and the body", () => {
	const options = { locale: "en-CA", timeZone: "America/Toronto" };
	expect(chatLine(line(), options)).toBe(
		"#ai Sep 09, 2026 at 08:34:56 AM EDT <Builder 01J8Z6X4Q3M2K1H0G9F8E7D6G1> rebase on main",
	);
	expect(chatLine(line({ actorKind: "human", actorName: "dana", actorDisplayName: null }), options)).toBe(
		"#ai Sep 09, 2026 at 08:34:56 AM EDT <dana> rebase on main",
	);
});

test("a worker batch holds every line and the two commands", () => {
	const text = chatBatchText(
		{ runId: "r", personaName: "Reviewer", kind: "reviewer", projectPath: "TRL.web" },
		[line(), line({ channel: "general", body: "second" })],
		{ locale: "en-CA", timeZone: "America/Toronto" },
	);
	expect(text.split("\n")).toEqual([
		"trellis chat: 2 new messages in the TRL.web room.",
		"#ai Sep 09, 2026 at 08:34:56 AM EDT <Builder 01J8Z6X4Q3M2K1H0G9F8E7D6G1> rebase on main",
		"#general Sep 09, 2026 at 08:34:56 AM EDT <Builder 01J8Z6X4Q3M2K1H0G9F8E7D6G1> second",
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
				mention: false,
			},
		],
		mentioned: false,
		recipient: { runId: "m", personaName: "Trellis" },
	});
});

test("a batch with a mention says so in its first line", () => {
	const text = chatBatchText({ runId: "r", personaName: "Builder", kind: "builder", projectPath: "TRL" }, [
		line({ direct: true }),
	]);
	expect(text.split("\n")[0]).toBe("trellis chat: 1 new message in the TRL room. One mentions you. Answer it now.");
});
