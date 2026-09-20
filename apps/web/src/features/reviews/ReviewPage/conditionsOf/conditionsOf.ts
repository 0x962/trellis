import type { Evidence, EvidenceFloor, TicketPr, TicketSummary } from "@trellis/api";
import type { Conditions } from "../../ConditionsBlock/conditionLines/conditionLines";
import type { LiveBranchState } from "../../ReviewLive/liveBranch";

export type ConditionsInput = {
	// The pull request row of the ticket that links this pull request, from
	// `reviews.status`. It carries the size, the risk answers, the check
	// counts, the open thread count and the flow runs.
	prRow: TicketPr | null;
	// The evidence records stored for the commit the page shows.
	records: readonly Evidence[];
	// What the change owes and what of it is already there, or `null` while
	// the changed file list of the pull request has not arrived.
	floor: EvidenceFloor | null;
	// The tickets that the ticket of this pull request waits on. The server
	// leaves out a ticket that reached Done, so every entry here names a
	// ticket that nobody merged yet.
	waitsOn: TicketSummary["waitsOn"];
	// What the live branch of the base reports, or `null` when GitHub
	// answered nothing.
	base: LiveBranchState | null;
};

// A run that waits has not started, and a run that runs has not finished, so
// both read as running. A canceled run counts in no group: nobody let it
// reach an answer.
const flowCounts = (runs: TicketPr["flowRuns"]): Conditions["flows"] => ({
	running: runs.filter((run) => run.status === "running" || run.status === "waiting").length,
	passed: runs.filter((run) => run.status === "succeeded").length,
	failed: runs.filter((run) => run.status === "failed").length,
});

// GitHub leaves the three size counts null until it measures the pull
// request. One missing count drops the whole size line.
const sizeOf = (prRow: TicketPr): Conditions["size"] =>
	prRow.additions === null || prRow.deletions === null || prRow.changedFiles === null
		? null
		: { additions: prRow.additions, deletions: prRow.deletions, changedFiles: prRow.changedFiles };

// The nine merge conditions of the review page, read from the pull request
// row of the ticket and from the evidence records.
//
// The answer is `null` while the poller has no risk answers for the pull
// request. Eight of the nine lines would then print a value that nobody
// measured, and the page draws no conditions at all instead.
export function conditionsOf({ prRow, records, floor, waitsOn, base }: ConditionsInput): Conditions | null {
	if (prRow === null || prRow.risk === null) return null;
	return {
		merged: prRow.state === "merged",
		size: sizeOf(prRow),
		sizeBand: prRow.sizeBand,
		risk: prRow.risk,
		tests: records.filter((record) => record.kind === "test").length,
		evidence: floor === null ? null : floor.present.length,
		checks: { pass: prRow.pass, fail: prRow.fail, pending: prRow.pending, skipped: prRow.skipped },
		threads: prRow.openThreads,
		flows: flowCounts(prRow.flowRuns),
		base,
		ancestors: waitsOn.map((dependency) => ({ identifier: dependency.identifier, merged: false })),
	};
}
