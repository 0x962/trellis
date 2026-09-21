import type { TicketPr, TicketSummary } from "@trellis/api";
import type { Conditions, EvidenceCondition } from "../../conditionLines/conditionLines";
import { flowsOf, sizeOf } from "../../ReviewPage/conditionsOf/conditionsOf";

// `evidence`, `evidenceRequired` and `kind` come from the changed file list,
// so the three are null together until the poller reads that list.
const evidenceOf = (pr: TicketPr): EvidenceCondition | null =>
	pr.evidence === null || pr.evidenceRequired === null || pr.kind === null
		? null
		: { present: pr.evidence, required: pr.evidenceRequired, kind: pr.kind };

// The merge conditions of one pull request, read from the pull request row of
// the ticket. `conditionsOf` builds the same shape for the review page from
// the evidence records, which the ticket page does not load. The row holds no
// test proof, so `tests` stays null.
// `mergeReadiness` would read those gaps as open conditions, so
// `ShortConditions` prints no readiness word.
//
// The function returns null while the poller has no risk answer for the pull
// request. Most lines would then print a value that nobody measured.
export function prConditions(pr: TicketPr, waitsOn: TicketSummary["waitsOn"]): Conditions | null {
	if (pr.risk === null) return null;
	return {
		merged: pr.state === "merged",
		size: sizeOf(pr),
		sizeBand: pr.sizeBand,
		risk: pr.risk,
		tests: null,
		evidence: evidenceOf(pr),
		checks: { pass: pr.pass, fail: pr.fail, pending: pr.pending, skipped: pr.skipped },
		threads: pr.openThreads,
		flows: flowsOf(pr),
		base: { behindBy: null, baseRefName: pr.baseRef },
		stackedOn:
			pr.stackedOn === null ? null : { number: pr.stackedOn.number, ticketIdentifier: pr.stackedOn.ticketIdentifier },
		// The server leaves a ticket that is done out of `waitsOn`, so every
		// entry is a ticket that nobody merged yet.
		ancestors: waitsOn.map((dependency) => ({ identifier: dependency.identifier, merged: false })),
	};
}
