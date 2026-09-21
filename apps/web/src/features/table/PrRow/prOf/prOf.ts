import type { TicketPr } from "@trellis/api";

// One pull request row for a test. `fields` replaces the values the test
// reads, and the rest take the values of a pull request that GitHub has not
// measured and that carries no check, no thread, no verdict and no flow run.
export const prOf = (fields: Partial<TicketPr>): TicketPr => ({
	id: "01M3300000000000000000PR01",
	number: 57080,
	owner: "0x962",
	repo: "trellis",
	url: "https://github.com/0x962/trellis/pull/57080",
	title: "Show the pull request title",
	state: "open",
	isDraft: false,
	isQueued: false,
	additions: null,
	deletions: null,
	changedFiles: null,
	sizeBand: null,
	kind: null,
	risk: null,
	evidence: null,
	evidenceRequired: null,
	evidenceMissing: null,
	pass: 0,
	fail: 0,
	pending: 0,
	skipped: 0,
	failedChecks: [],
	openThreads: 0,
	verdict: null,
	flowRuns: [],
	flowRunCount: 0,
	baseRef: "main",
	headRef: "trellis/trl-181",
	stackedOn: null,
	...fields,
});
