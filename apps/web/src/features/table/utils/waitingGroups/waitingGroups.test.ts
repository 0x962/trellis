import { describe, expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import { forYouCount, rowWaiting, waitingBucketOf } from "./waitingGroups";

const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 42,
		owner: "acme",
		repo: "app",
		url: "https://github.com/acme/app/pull/42",
		state: "open",
		isDraft: false,
		reviewGaps: [],
		fail: 0,
		pending: 0,
		openThreads: 0,
		...fields,
	}) as TicketPr;

const ticket = (
	id: string,
	fields: {
		category?: TicketSummary["status"]["category"];
		waitsOn?: TicketSummary["waitsOn"];
		prRows?: TicketPr[];
		ready?: boolean;
	} = {},
): TicketSummary =>
	({
		id,
		status: { category: fields.category ?? "started" },
		waitsOn: fields.waitsOn ?? [],
		prRows: fields.prRows ?? [],
		ready: fields.ready ?? false,
	}) as TicketSummary;

const humanReview = ticket("human-review", { category: "review" });
const review = ticket("review", { prRows: [pullRequest()] });
const start = ticket("start", { category: "todo", ready: true });
const draft = ticket("draft", {
	prRows: [pullRequest({ reviewGaps: [{ kind: "not-asked", count: 1 }] })],
});
const checks = ticket("checks", {
	prRows: [pullRequest({ pending: 3, reviewGaps: [{ kind: "checks-pending", count: 3 }] })],
});
const merge = ticket("merge", {
	category: "todo",
	waitsOn: [{ identifier: "OP-32" } as TicketSummary["waitsOn"][number]],
});
const shipped = ticket("shipped", { category: "done" });

describe("waitingBucketOf", () => {
	test("names and ranks the six groups in display order", () => {
		const rows = [shipped, merge, checks, draft, start, humanReview];

		const marks = rows.map((row) => waitingBucketOf(row)).sort((a, b) => a.rank - b.rank);

		expect(marks.map((mark) => mark.label)).toEqual([
			"Waits for you",
			"Ready to start",
			"With an agent",
			"With GitHub",
			"Waits on a merge",
			"Done",
		]);
	});

	test("writes the key of a group", () => {
		expect(waitingBucketOf(merge).key).toBe("merge");
		expect(waitingBucketOf(shipped).key).toBe("done");
	});

	test("a ticket whose agent run works waits for the agent", () => {
		expect(waitingBucketOf(review, new Set(["review"])).label).toBe("With an agent");
		expect(waitingBucketOf(start, new Set(["start"])).label).toBe("With an agent");
	});
});

describe("rowWaiting", () => {
	test("reads what a row with no working run waits for", () => {
		expect(rowWaiting(review)).toBe("you");
		expect(rowWaiting(start)).toBe("ready");
	});
});

describe("forYouCount", () => {
	test("counts the human reviews and the pull requests that wait for the person", () => {
		expect(forYouCount([humanReview, review, draft, merge, shipped])).toBe(2);
	});

	test("drops a row whose agent run works", () => {
		expect(forYouCount([humanReview, review], new Set(["review"]))).toBe(1);
	});

	test("counts nothing in a set that holds no row of the person", () => {
		expect(forYouCount([draft, merge, shipped])).toBe(0);
	});
});
