import { expect, test } from "bun:test";
import type { TicketPr } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnLine, turnSentence } from "./TurnLine";

const prRow = (fields: Partial<TicketPr> = {}): TicketPr =>
	({ isDraft: false, fail: 0, pending: 0, openThreads: 0, ...fields }) as TicketPr;

test("your turn prints one sentence and no reason", () => {
	expect(turnSentence({ turn: "you", prRow: prRow({ pending: 6 }), mergedOn: null })).toBe("Your turn.");
});

test("the turn of an agent names the failed check count", () => {
	expect(turnSentence({ turn: "agent", prRow: prRow({ fail: 1 }), mergedOn: null })).toBe(
		"The agent's turn. 1 check failed.",
	);
});

test("an agent with no failed check and one open comment reads the comment", () => {
	expect(turnSentence({ turn: "agent", prRow: prRow({ openThreads: 2 }), mergedOn: null })).toBe(
		"The agent's turn. 2 comments open.",
	);
});

test("a draft with no failed check and no open comment does not hold the turn", () => {
	expect(turnSentence({ turn: "agent", prRow: prRow({ isDraft: true }), mergedOn: null })).toBe("The agent's turn.");
});

test("the turn of GitHub names the pending check count", () => {
	expect(turnSentence({ turn: "github", prRow: prRow({ pending: 6 }), mergedOn: null })).toBe(
		"GitHub's turn. 6 checks pending.",
	);
});

test("a merged pull request prints the day it merged, whatever the ticket waits for", () => {
	expect(turnSentence({ turn: "done", prRow: prRow(), mergedOn: "2026-09-18" })).toBe("Merged 2026-09-18.");
	expect(turnSentence({ turn: "ready", prRow: prRow(), mergedOn: "2026-09-18" })).toBe("Merged 2026-09-18.");
});

test("a closed pull request that nobody merged reads done", () => {
	expect(turnSentence({ turn: "done", prRow: prRow(), mergedOn: null })).toBe("Done.");
});

test("a turn with no pull request row prints the subject alone", () => {
	expect(turnSentence({ turn: "agent", prRow: null, mergedOn: null })).toBe("The agent's turn.");
});

test("the line renders the sentence", () => {
	const html = renderToStaticMarkup(<TurnLine turn="github" prRow={prRow({ pending: 6 })} mergedOn={null} />);

	expect(html).toContain("GitHub&#x27;s turn. 6 checks pending.");
});
