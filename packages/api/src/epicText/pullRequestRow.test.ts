import { describe, expect, test } from "bun:test";
import { reviewGaps } from "../reviewReady/reviewReady.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";
import { pullRequestRowLine } from "./pullRequestRow.ts";

// The server computes `reviewGaps` from the facts of the row, so the fixture
// computes it the same way. The explanation, the evidence document and the
// flow are there unless a test says otherwise.
const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr => {
	const row = {
		number: 57080,
		state: "open",
		isDraft: false,
		isQueued: false,
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
		mergeable: "mergeable",
		...fields,
	} as TicketPr;
	return {
		...row,
		reviewGaps:
			fields.reviewGaps ??
			reviewGaps({
				state: row.state,
				localState: "ready",
				failedChecks: row.fail,
				pendingChecks: row.pending,
				hasExplanation: true,
				hasEvidence: true,
				flowAnswered: true,
				openFindings: row.openThreads,
				mergeable: row.mergeable,
			}),
	};
};

describe("pullRequestRowLine", () => {
	test("prints the state, the size, the checks and what the pull request waits for", () => {
		expect(pullRequestRowLine(pullRequest())).toBe(
			"#57080  not ready · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · agent",
		);
	});

	test("names the pull request this one merges after", () => {
		const pr = pullRequest({
			reviewGaps: [{ kind: "not-asked", count: 1 }],
			stackedOn: { number: 55569, headRef: "nk/operator-routine-execution", ticketIdentifier: "OP-32" },
			additions: 73,
			deletions: 9,
			changedFiles: 3,
			pass: 9,
			fail: 0,
			pending: 0,
		});
		expect(pullRequestRowLine(pr)).toBe("#57080  not ready · stacked on #55569 · +73 −9 · 3 files · 9 passed · agent");
	});

	test("prints queued for a pull request in the merge queue", () => {
		expect(pullRequestRowLine(pullRequest({ isQueued: true }))).toStartWith("#57080  queued ·");
	});

	test("waits for the person when every check passed and no comment is open", () => {
		expect(
			pullRequestRowLine(pullRequest({ fail: 0, pending: 0, changedFiles: 7, additions: 186, deletions: 44 })),
		).toBe("#57080  open · +186 −44 · 7 files · 47 passed · you");
	});

	test("waits for GitHub while a check is pending", () => {
		expect(pullRequestRowLine(pullRequest({ fail: 0 }))).toBe(
			"#57080  not ready · +311 −12 · 6 files · 6 pending · 47 passed · github",
		);
	});

	test("prints the open comments and the newest flow run", () => {
		const pr = pullRequest({
			openThreads: 1,
			flowRuns: [
				{ name: "Code Reviewer", status: "succeeded", findings: 0 },
				{ name: "Code Reviewer", status: "failed", findings: 2 },
			],
		});
		expect(pullRequestRowLine(pr)).toBe(
			"#57080  not ready · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · 1 comment · flow: passed · agent",
		);
	});

	test("prints no turn for a merged pull request", () => {
		const pr = pullRequest({ state: "merged", fail: 0, pending: 0, additions: 0, deletions: 0, changedFiles: 0 });
		expect(pullRequestRowLine(pr)).toBe("#57080  merged · 47 passed");
	});
});
