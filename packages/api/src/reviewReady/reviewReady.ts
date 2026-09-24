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
// Waiting grouping, the Needs you inbox, the pull request sheet and
// `trellis ready` all answer from this list, so they never disagree.
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

// True when the pull request holds every part the person needs. The server
// puts the gaps in the row it sends, so a caller that holds a row does not
// compute the rule again.
//
// This does not decide the words on the screen. "Ready for review" and "Not
// ready for review" come from `askedForReview`, which reads the flag of the
// agent alone.
export const readyForReview = (pr: { reviewGaps: ReviewGap[] }): boolean => pr.reviewGaps.length === 0;

// True when the agent set the local review state of the pull request to
// `ready`. The `not-asked` gap is the only place a row carries that stored
// flag, so this reads it back.
//
// A failed check, a pending check, an open finding and a conflict are
// separate facts. None of them clears this flag.
export const askedForReview = (pr: { reviewGaps: ReviewGap[] }): boolean =>
	!pr.reviewGaps.some((gap) => gap.kind === "not-asked");

// The gaps that the one pull request badge of a ticket row shows when the
// ticket links more than one pull request. A pull request that the agent
// holds back comes first, so a check that passes or fails never changes the
// badge while one agent has not asked for review. When the agent handed
// every one over, the badge takes the gaps of the first that still misses a
// part. A closed or merged pull request misses none.
export const ticketReviewGaps = (prRows: readonly { reviewGaps: ReviewGap[] }[]): ReviewGap[] => {
	const heldBack = prRows.find((pullRequest) => !askedForReview(pullRequest));
	const missesAPart = prRows.find((pullRequest) => !readyForReview(pullRequest));
	return (heldBack ?? missesAPart)?.reviewGaps ?? [];
};

// The state of a pull request in one lowercase word. A closed or merged pull
// request prints its own state. An open one prints `queued` while it sits in
// the merge queue, then `not ready` while the agent has not asked for review,
// and `open` otherwise. The caller sets the letter case that its surface
// needs.
//
// The epic row of the CLI, the row of the diffs page and the child row of
// the ticket page all print this word, and the glyph beside each one reads
// the same flag.
export const prStateWord = (pr: { state: string; isQueued: boolean; reviewGaps: ReviewGap[] }): string => {
	if (pr.state === "open" && pr.isQueued) return "queued";
	return pr.state === "open" && !askedForReview(pr) ? "not ready" : pr.state;
};

const checkWord = (count: number) => (count === 1 ? "check" : "checks");

// The parts that the surfaces around a pull request glyph do not draw on
// their own. The check counts sit in the check ribbon, the conflict has its
// own mark, and the review flag is the glyph itself.
const DESCRIBED_GAP_KINDS: ReviewGapKind[] = ["explanation", "evidence", "flow-run", "findings"];

// The plain words for one missing part. `trellis ready` prints one line per
// part from these words.
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

// The parts of the review material that a pull request still misses, in one
// line, or null when it misses none. The tooltip of the glyph puts this line
// under its own words, so a pull request that the agent handed over still
// names a missing evidence document.
//
// A push takes the explanation and the evidence of the older commit away and
// leaves the review flag at `ready`, so the glyph alone states nothing about
// that loss.
export const missingPartsText = (pr: { reviewGaps: ReviewGap[] }): string | null => {
	const parts = pr.reviewGaps.filter((gap) => DESCRIBED_GAP_KINDS.includes(gap.kind));
	return parts.length === 0 ? null : parts.map(reviewGapText).join(", ");
};
