import { expect, test } from "bun:test";
import { foldedLine, isCollapsible, summaryOf } from "./foldedLine";
import type { Thread } from "./thread";

const thread = (over: Partial<Thread> = {}): Thread => ({
	id: "t1",
	author: "backend-checks",
	kind: "agent",
	session: null,
	body: "This call has no timeout.\nThe second line stays out of the one line.",
	createdAt: "2026-09-23T00:19:19.318Z",
	version: 1,
	reactions: [],
	replies: [],
	status: "open",
	resolvedBy: null,
	...over,
});

test("the summary takes the first line of the body", () => {
	expect(summaryOf("This call has no timeout.\nAnd a second line.")).toBe("This call has no timeout.");
});

test("a body that opens with a suggestion block names the change", () => {
	expect(summaryOf("```suggestion\nconst timeout = 30;\n```")).toBe("Suggested change");
	expect(summaryOf("~~~ suggestion\nconst timeout = 30;\n~~~")).toBe("Suggested change");
});

test("an empty body gives an empty summary", () => {
	expect(summaryOf("")).toBe("");
});

test("a resolved thread and an outdated thread both collapse", () => {
	expect(isCollapsible("resolved", false)).toBe(true);
	expect(isCollapsible("open", true)).toBe(true);
	expect(isCollapsible("open", false)).toBe(false);
});

test("the one line names the resolver, the author, the place and the first words", () => {
	const line = foldedLine(
		thread({ status: "resolved", resolvedBy: "navid" }),
		"backend/briefing.py:52",
		false,
		"Fix this.",
	);

	expect(line).toBe("Resolved by navid · backend-checks · backend/briefing.py:52 · Fix this.");
});

test("a thread resolved a moment ago names no resolver", () => {
	const line = foldedLine(thread({ status: "resolved" }), "backend/briefing.py:52", false, "Fix this.");

	expect(line).toBe("Resolved · backend-checks · backend/briefing.py:52 · Fix this.");
});

test("an outdated thread opens with the word Outdated", () => {
	const line = foldedLine(thread(), "backend/briefing.py:52", true, "Fix this.");

	expect(line).toBe("Outdated · backend-checks · backend/briefing.py:52 · Fix this.");
});

test("a thread with no anchor and an empty body leaves those parts out", () => {
	expect(foldedLine(thread(), undefined, false, "")).toBe("backend-checks");
});
