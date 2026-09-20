import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import { forYouCount, rowTurn, turnBucketOf } from "./turnGroups";

const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 42,
		owner: "acme",
		repo: "app",
		url: "https://github.com/acme/app/pull/42",
		state: "open",
		isDraft: false,
		fail: 0,
		pending: 0,
		openThreads: 0,
		...fields,
	}) as TicketPr;

const ticket = (
	id: string,
	fields: {
		category?: TicketSummary["status"]["category"];
		reviewer?: TicketSummary["status"]["reviewer"];
		waitsOn?: TicketSummary["waitsOn"];
		prRows?: TicketPr[];
		ready?: boolean;
	} = {},
): TicketSummary =>
	({
		id,
		status: { category: fields.category ?? "started", reviewer: fields.reviewer ?? null },
		waitsOn: fields.waitsOn ?? [],
		prRows: fields.prRows ?? [],
		ready: fields.ready ?? false,
	}) as TicketSummary;

const question = ticket("question", { reviewer: "human" });
const review = ticket("review", { prRows: [pullRequest()] });
const start = ticket("start", { category: "todo", ready: true });
const draft = ticket("draft", { prRows: [pullRequest({ isDraft: true })] });
const checks = ticket("checks", { prRows: [pullRequest({ pending: 3 })] });
const answer = ticket("answer", {
	category: "todo",
	waitsOn: [{ identifier: "OP-53", isQuestion: true } as TicketSummary["waitsOn"][number]],
});
const merge = ticket("merge", {
	category: "todo",
	waitsOn: [{ identifier: "OP-32", isQuestion: false } as TicketSummary["waitsOn"][number]],
});
const shipped = ticket("shipped", { category: "done" });

describe("turnBucketOf", () => {
	test("names and ranks the seven groups in display order", () => {
		const rows = [shipped, merge, answer, checks, draft, start, question];

		const marks = rows.map((row) => turnBucketOf(row)).sort((a, b) => a.rank - b.rank);

		expect(marks.map((mark) => mark.label)).toEqual([
			"Your turn",
			"Ready to start",
			"With an agent",
			"With GitHub",
			"Waits on your answer",
			"Waits on a merge",
			"Done",
		]);
	});

	test("writes a key with a dash for each space", () => {
		expect(turnBucketOf(answer).key).toBe("waits-on-your-answer");
		expect(turnBucketOf(merge).key).toBe("waits-on-a-merge");
		expect(turnBucketOf(shipped).key).toBe("done");
	});

	test("gives a ticket whose agent run works to the agent", () => {
		expect(turnBucketOf(review, new Set(["review"])).label).toBe("With an agent");
		expect(turnBucketOf(start, new Set(["start"])).label).toBe("With an agent");
	});
});

describe("rowTurn", () => {
	test("reads the turn of a row with no working run", () => {
		expect(rowTurn(review)).toBe("you");
		expect(rowTurn(start)).toBe("ready");
	});
});

describe("forYouCount", () => {
	test("counts the questions and the pull requests that wait for the person", () => {
		expect(forYouCount([question, review, draft, merge, shipped])).toBe(2);
	});

	test("drops a row whose agent run works", () => {
		expect(forYouCount([question, review], new Set(["review"]))).toBe(1);
	});

	test("counts nothing in a set that holds no row of the person", () => {
		expect(forYouCount([draft, merge, shipped])).toBe(0);
	});
});
