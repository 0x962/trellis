import { describe, expect, test } from "bun:test";
import type { TicketPr } from "../schemas/ticketPr.ts";
import { pullRequestRowLine } from "./pullRequestRow.ts";

const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 57080,
		state: "open",
		isDraft: false,
		additions: 311,
		deletions: 12,
		changedFiles: 6,
		pass: 47,
		fail: 1,
		pending: 6,
		skipped: 0,
		openThreads: 0,
		flowRuns: [],
		stackedOn: null,
		...fields,
	}) as TicketPr;

describe("pullRequestRowLine", () => {
	test("prints the state, the size, the checks and the turn", () => {
		expect(pullRequestRowLine(pullRequest())).toBe(
			"#57080  open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · agent",
		);
	});

	test("names the pull request this one merges after", () => {
		const pr = pullRequest({
			isDraft: true,
			stackedOn: { number: 55569, headRef: "nk/operator-routine-execution", ticketIdentifier: "OP-32" },
			additions: 73,
			deletions: 9,
			changedFiles: 3,
			pass: 9,
			fail: 0,
			pending: 0,
		});
		expect(pullRequestRowLine(pr)).toBe("#57080  draft · stacked on #55569 · +73 −9 · 3 files · 9 passed · agent");
	});

	test("gives the turn to the person when every check passed and no thread is open", () => {
		expect(
			pullRequestRowLine(pullRequest({ fail: 0, pending: 0, changedFiles: 7, additions: 186, deletions: 44 })),
		).toBe("#57080  open · +186 −44 · 7 files · 47 passed · you");
	});

	test("gives the turn to GitHub while a check is pending", () => {
		expect(pullRequestRowLine(pullRequest({ fail: 0 }))).toBe(
			"#57080  open · +311 −12 · 6 files · 6 pending · 47 passed · github",
		);
	});

	test("prints the open threads and the newest flow run", () => {
		const pr = pullRequest({ openThreads: 1, flowRuns: [{ status: "succeeded" }, { status: "failed" }] });
		expect(pullRequestRowLine(pr)).toBe(
			"#57080  open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · 1 thread · flow: passed · agent",
		);
	});

	test("prints no turn for a merged pull request", () => {
		const pr = pullRequest({ state: "merged", fail: 0, pending: 0, additions: 0, deletions: 0, changedFiles: 0 });
		expect(pullRequestRowLine(pr)).toBe("#57080  merged · 47 passed");
	});
});
