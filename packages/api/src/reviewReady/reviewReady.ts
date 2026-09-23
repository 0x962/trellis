import type { LocalPrState, Mergeable, PrState } from "../schemas/enums.ts";

// Everything a pull request must hold before the person reviews it. Each
// field is a stored fact, never a judgment: the server reads them from its
// tables, and this file turns them into the list of what is still missing.
//
// `flowAnswered` is true when a flow run of this pull request has the status
// "succeeded", when the agent wrote why no flow fits the change, or when no
// flow applies to the project. One run answers for the whole pull request,
// and a later push keeps that answer. A flow run asks the person nothing, so
// a run with the status "waiting" did not finish and answers nothing.
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
// glyph, the Waiting grouping, the Needs you inbox, the pull request sheet
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

// The server puts the gaps in the row it sends, so a caller that holds a row
// does not compute the rule again.
export const readyForReview = (pr: { reviewGaps: ReviewGap[] }): boolean => pr.reviewGaps.length === 0;

// True while the agent has not run `trellis ready`. GitHub takes no review
// then. This is one part of the rule, not the whole of it: a pull request
// the agent did ask to review can still wait for a check or a finding.
export const askedForReview = (pr: { reviewGaps: ReviewGap[] }): boolean =>
	!pr.reviewGaps.some((gap) => gap.kind === "not-asked");

const checkWord = (count: number) => (count === 1 ? "check" : "checks");

// The plain words for one missing part. The glyph tooltip shows the first
// one, and the pull request sheet shows the whole list.
export const reviewGapText = (gap: ReviewGap): string => {
	if (gap.kind === "not-asked") return "the agent has not asked for review";
	if (gap.kind === "explanation") return "no explanation for this commit";
	if (gap.kind === "evidence") return "no evidence document";
	if (gap.kind === "flow-run") return "no flow run finished for this pull request";
	if (gap.kind === "checks-failed") return `${gap.count} ${checkWord(gap.count)} failed`;
	if (gap.kind === "checks-pending") return `${gap.count} ${checkWord(gap.count)} pending`;
	if (gap.kind === "findings") return `${gap.count} review ${gap.count === 1 ? "finding" : "findings"} open`;
	return "the pull request conflicts with its base branch";
};

// The first part a pull request still needs, in plain words, or null when it
// needs none. One line of a tooltip holds one part, and the caller that draws
// the glyph puts "Not ready for review" in front of it.
export const firstReviewGapText = (pr: { reviewGaps: ReviewGap[] }): string | null => {
	const first = pr.reviewGaps[0];
	return first === undefined ? null : reviewGapText(first);
};
