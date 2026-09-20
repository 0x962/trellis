import { describe, expect, test } from "bun:test";
import type { TicketPr } from "@trellis/api";
import { prRowCells } from "./prRowText";

const prOf = (fields: Partial<TicketPr>): TicketPr => ({
	number: 57080,
	owner: "0x962",
	repo: "trellis",
	url: "https://github.com/0x962/trellis/pull/57080",
	state: "open",
	isDraft: false,
	additions: null,
	deletions: null,
	changedFiles: null,
	sizeBand: null,
	pass: 0,
	fail: 0,
	pending: 0,
	skipped: 0,
	failedChecks: [],
	openThreads: 0,
	flowRuns: [],
	flowRunCount: 0,
	baseRef: "main",
	headRef: "trellis/trl-181",
	stackedOn: null,
	...fields,
});

const textOf = (pr: TicketPr) =>
	prRowCells(pr)
		.map((cell) => cell.text)
		.join(" · ");

const toneOf = (pr: TicketPr, key: string) => prRowCells(pr).find((cell) => cell.key === key)?.tone;

describe("prRowCells", () => {
	test("prints the state, the size, the checks, the threads and the turn in order", () => {
		const cells = prOf({
			additions: 311,
			deletions: 12,
			changedFiles: 6,
			fail: 1,
			pending: 6,
			pass: 47,
			openThreads: 2,
		});

		expect(textOf(cells)).toBe("open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · 2 threads · agent");
	});

	test("names the pull request this one is stacked on, after the state", () => {
		const cells = prOf({
			isDraft: true,
			stackedOn: { number: 55569, headRef: "nk/operator-routine-execution", ticketIdentifier: "TRL-32" },
			pass: 9,
		});

		expect(textOf(cells)).toBe("draft · stacked on #55569 · 9 passed · agent");
	});

	test("names the state of the newest flow run before the turn", () => {
		const cells = prOf({ flowRuns: [{ status: "succeeded" }, { status: "failed" }], flowRunCount: 2, pass: 43 });

		expect(textOf(cells)).toBe("open · 43 passed · flow: passed · you");
	});

	test("drops the size and the file count while GitHub has measured neither", () => {
		expect(textOf(prOf({ pass: 43 }))).toBe("open · 43 passed · you");
	});

	test("drops a check bucket, a thread count and a flow that count zero", () => {
		expect(textOf(prOf({ state: "merged", pass: 43 }))).toBe("merged · 43 passed");
	});

	test("writes the singular word for a count of one", () => {
		const cells = prOf({ additions: 4, deletions: 0, changedFiles: 1, openThreads: 1 });

		expect(textOf(cells)).toBe("open · +4 −0 · 1 file · 1 thread · agent");
	});

	test("a merged pull request that was a draft reads as merged and leaves nobody to act", () => {
		expect(textOf(prOf({ state: "merged", isDraft: true }))).toBe("merged");
	});

	test("draws the failed count in the danger color and every other count in the row color", () => {
		const cells = prOf({ fail: 2, pass: 8 });

		expect(toneOf(cells, "failed")).toBe("danger");
		expect(toneOf(cells, "passed")).toBe("muted");
	});

	test("draws the turn of the person in the foreground color, and the turn of another in the row color", () => {
		expect(toneOf(prOf({ pass: 43 }), "turn")).toBe("fg");
		expect(toneOf(prOf({ pending: 1 }), "turn")).toBe("muted");
		expect(textOf(prOf({ pending: 1 }))).toBe("open · 1 pending · github");
	});
});
