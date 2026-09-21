import type { Evidence, EvidenceFloor, TicketPr, TicketSummary } from "@trellis/api";
import type {
	BaseCondition,
	Conditions,
	FlowsCondition,
	FlowWord,
	TestsCondition,
} from "../../conditionLines/conditionLines";

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
	// How far the head of the revision on screen sits behind its base branch,
	// or `null` for a revision fetched before the page read the distance.
	base: BaseCondition | null;
};

// A run that waits has not started, and a run that runs has not finished, so
// both read as running.
const flowWordOf: Record<TicketPr["flowRuns"][number]["status"], FlowWord> = {
	running: "running",
	waiting: "running",
	succeeded: "passed",
	failed: "failed",
	canceled: "canceled",
};

// `flowRuns` holds the five newest runs of the ticket, newest first, and
// `flowRunCount` holds how many runs the ticket has.
export const flowsOf = (prRow: TicketPr): FlowsCondition => ({
	total: prRow.flowRunCount,
	newest: prRow.flowRuns.map((run) => flowWordOf[run.status]),
});

// A record holds free-form JSON, so every field of it reads as text or as
// nothing.
const textField = (record: Evidence["record"], key: string): string | null =>
	typeof record[key] === "string" ? record[key] : null;

// The one value that every record names, or null when they name more than
// one. Two test proofs that name two different base commits cannot print one
// base commit.
const sharedField = (records: readonly Evidence[], key: string): string | null => {
	const values = new Set(records.map((record) => textField(record.record, key)));
	const [only] = [...values];
	return values.size === 1 && only !== undefined ? only : null;
};

// `trellis evidence add --kind test` writes either a test name with the two
// commits, or the words that no test applies to the change.
const testsOf = (records: readonly Evidence[]): TestsCondition => {
	const proofs = records.filter((record) => record.kind === "test");
	const named = proofs.filter((record) => textField(record.record, "name") !== null);
	return {
		count: named.length,
		failsOn: sharedField(named, "failsOn"),
		passesOn: sharedField(named, "passesOn"),
		noneApplies: proofs.some((record) => record.record.none === true),
	};
};

// GitHub leaves the three size counts null until it measures the pull
// request. One missing count drops the whole size line.
export const sizeOf = (prRow: TicketPr): Conditions["size"] =>
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
		tests: testsOf(records),
		evidence:
			floor === null ? null : { present: floor.present.length, required: floor.required.length, kind: floor.kind },
		checks: { pass: prRow.pass, fail: prRow.fail, pending: prRow.pending, skipped: prRow.skipped },
		threads: prRow.openThreads,
		flows: flowsOf(prRow),
		base,
		ancestors: waitsOn.map((dependency) => ({ identifier: dependency.identifier, merged: false })),
	};
}
