import type { TicketPr, TicketSummary } from "@trellis/api";
import type { Conditions } from "../../../../../reviews/ConditionsBlock";

// A run that waits has not started, so it counts as running.
const flowsOf = (runs: TicketPr["flowRuns"]): Conditions["flows"] => ({
	running: runs.filter((run) => run.status === "running" || run.status === "waiting").length,
	passed: runs.filter((run) => run.status === "succeeded").length,
	failed: runs.filter((run) => run.status === "failed").length,
});

// GitHub leaves the three size counts null until it measures the pull
// request. One missing count drops the whole size line.
const sizeOf = (pr: TicketPr): Conditions["size"] =>
	pr.additions === null || pr.deletions === null || pr.changedFiles === null
		? null
		: { additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changedFiles };

// The merge conditions of one pull request, read from the pull request row of
// the ticket. The row holds no test proof and no base branch state, so
// `tests` and `base` stay null, and the readiness word cannot read `yes` on
// the ticket page. The review page reads both.
//
// The answer is null while the poller has no risk answers for the pull
// request, because most lines would then print a value that nobody measured.
export function prConditions(pr: TicketPr, waitsOn: TicketSummary["waitsOn"]): Conditions | null {
	if (pr.risk === null) return null;
	return {
		merged: pr.state === "merged",
		size: sizeOf(pr),
		sizeBand: pr.sizeBand,
		risk: pr.risk,
		tests: null,
		evidence: pr.evidence,
		checks: { pass: pr.pass, fail: pr.fail, pending: pr.pending, skipped: pr.skipped },
		threads: pr.openThreads,
		flows: flowsOf(pr.flowRuns),
		base: null,
		// The server leaves a ticket that is done out of `waitsOn`, so every
		// entry is a ticket that nobody merged yet.
		ancestors: waitsOn.map((dependency) => ({ identifier: dependency.identifier, merged: false })),
	};
}
