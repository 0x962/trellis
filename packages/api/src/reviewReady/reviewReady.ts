import type { LocalPrState, Mergeable, PrState } from "../schemas/enums.ts";

// Everything a pull request must hold before the person reviews it. Each
// field is a stored fact, never a judgment: the server reads them from its
// tables, and this file turns them into the list of what is still missing.
//
// `flowAnswered` is true when a flow run of the commit the pull request
// points at now succeeded, when the agent wrote why no flow fits that
// commit, or when the server holds no flow at all. A flow is machine
// review and it asks the person nothing, so a run that stopped and waits
// counts as a run that did not finish.
export type ReviewReadyFacts = {
	state: PrState;
	localState: LocalPrState;
	failedChecks: number;
	pendingChecks: number;
	hasExplanation: boolean;
	hasEvidence: boolean;
	flowAnswered: boolean;
	openFindings: number;
	mergeable: Mergeable;
};

// One part the pull request still needs. `count` says how many, and it is 1
// for a part that is there or not there.
export const REVIEW_GAP_KINDS = [
	"not-asked",
	"explanation",
	"evidence",
	"flow-run",
	"checks-failed",
	"checks-pending",
	"findings",
	"conflict",
] as const;
export type ReviewGapKind = (typeof REVIEW_GAP_KINDS)[number];
export type ReviewGap = { kind: ReviewGapKind; count: number };

const one = (kind: ReviewGapKind): ReviewGap => ({ kind, count: 1 });

// The one rule that decides whether a pull request is ready for review. The
// glyph, the turn of a ticket, the Needs you inbox, the pull request sheet
// and `trellis ready` all answer from this list, so they never disagree.
//
// A closed or merged pull request needs nothing: its glyph already says
// closed or merged, and nobody reviews it again.
export const reviewGaps = (facts: ReviewReadyFacts): ReviewGap[] => {
	if (facts.state !== "open") return [];
	return [
		...(facts.localState === "ready" ? [] : [one("not-asked")]),
		...(facts.hasExplanation ? [] : [one("explanation")]),
		...(facts.hasEvidence ? [] : [one("evidence")]),
		...(facts.flowAnswered ? [] : [one("flow-run")]),
		...(facts.failedChecks === 0 ? [] : [{ kind: "checks-failed" as const, count: facts.failedChecks }]),
		...(facts.pendingChecks === 0 ? [] : [{ kind: "checks-pending" as const, count: facts.pendingChecks }]),
		...(facts.openFindings === 0 ? [] : [{ kind: "findings" as const, count: facts.openFindings }]),
		...(facts.mergeable === "conflicting" ? [one("conflict")] : []),
	];
};

// What every surface calls a pull request that holds all of it. The wire
// carries the gaps, so a caller with a row and no facts reads this instead of
// computing the rule again.
export const readyForReview = (pr: { reviewGaps: ReviewGap[] }): boolean => pr.reviewGaps.length === 0;

const checkWord = (count: number) => (count === 1 ? "check" : "checks");

// The plain words for one missing part. The glyph tooltip shows the first
// one, and the pull request sheet shows the whole list.
export const reviewGapText = (gap: ReviewGap): string => {
	if (gap.kind === "not-asked") return "the agent has not asked for review";
	if (gap.kind === "explanation") return "no explanation for this commit";
	if (gap.kind === "evidence") return "no evidence document";
	if (gap.kind === "flow-run") return "no flow finished on this commit";
	if (gap.kind === "checks-failed") return `${gap.count} ${checkWord(gap.count)} failed`;
	if (gap.kind === "checks-pending") return `${gap.count} ${checkWord(gap.count)} pending`;
	if (gap.kind === "findings") return `${gap.count} review ${gap.count === 1 ? "finding" : "findings"} open`;
	return "the pull request conflicts with its base branch";
};

// The sentence a person reads on the glyph. A ready pull request says so in
// three words. A pull request that is not ready names the first part it
// still needs, because one line of a tooltip holds one reason.
export const reviewReadyLabel = (pr: { reviewGaps: ReviewGap[] }): string => {
	const first = pr.reviewGaps[0];
	return first === undefined ? "Ready for review" : `Not ready for review: ${reviewGapText(first)}`;
};
