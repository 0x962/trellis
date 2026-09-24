import { expect, test } from "bun:test";
import {
	askedForReview,
	missingPartsText,
	prStateWord,
	type ReviewGap,
	type ReviewReadyFacts,
	readyForReview,
	reviewGaps,
	reviewGapText,
	ticketReviewGaps,
} from "./reviewReady.ts";

// A pull request that holds every part. Each test takes this away one fact
// at a time, which is what happens to a real pull request after a push, a
// failed check or a new finding.
const ready: ReviewReadyFacts = {
	state: "open",
	localState: "ready",
	failedChecks: 0,
	pendingChecks: 0,
	hasExplanation: true,
	hasEvidence: true,
	flowAnswered: true,
	openFindings: 0,
	mergeable: "mergeable",
};

const kinds = (facts: Partial<ReviewReadyFacts>) => reviewGaps({ ...ready, ...facts }).map((gap) => gap.kind);

test("a pull request with every part is ready for review", () => {
	expect(reviewGaps(ready)).toEqual([]);
	expect(readyForReview({ reviewGaps: reviewGaps(ready) })).toBe(true);
});

test("each missing part takes the pull request back to not ready", () => {
	expect(kinds({ localState: "not-ready" })).toEqual(["not-asked"]);
	expect(kinds({ hasExplanation: false })).toEqual(["explanation"]);
	expect(kinds({ hasEvidence: false })).toEqual(["evidence"]);
	expect(kinds({ flowAnswered: false })).toEqual(["flow-run"]);
	expect(kinds({ failedChecks: 1 })).toEqual(["checks-failed"]);
	expect(kinds({ pendingChecks: 2 })).toEqual(["checks-pending"]);
	expect(kinds({ openFindings: 3 })).toEqual(["findings"]);
	expect(kinds({ mergeable: "conflicting" })).toEqual(["conflict"]);
});

test("the pull request is ready again once the fact holds", () => {
	const broken = { ...ready, pendingChecks: 2 };
	expect(readyForReview({ reviewGaps: reviewGaps(broken) })).toBe(false);
	expect(readyForReview({ reviewGaps: reviewGaps({ ...broken, pendingChecks: 0 }) })).toBe(true);
});

// The pull request glyph, the state word of the diffs page and the state
// word of the CLI epic row all read this one answer.
test("only the local review state answers whether the agent asked for review", () => {
	const asked = (facts: Partial<ReviewReadyFacts>) =>
		askedForReview({ reviewGaps: reviewGaps({ ...ready, ...facts }) });

	expect(asked({})).toBe(true);
	expect(asked({ failedChecks: 1 })).toBe(true);
	expect(asked({ pendingChecks: 2 })).toBe(true);
	expect(asked({ openFindings: 3 })).toBe(true);
	expect(asked({ mergeable: "conflicting" })).toBe(true);
	expect(asked({ hasEvidence: false, flowAnswered: false })).toBe(true);
	expect(asked({ localState: "not-ready" })).toBe(false);
	expect(asked({ localState: "not-ready", failedChecks: 0, pendingChecks: 0 })).toBe(false);
});

test("a pull request that is not open needs nothing", () => {
	expect(reviewGaps({ ...ready, state: "merged", localState: "not-ready", failedChecks: 3 })).toEqual([]);
	expect(reviewGaps({ ...ready, state: "closed", localState: "not-ready" })).toEqual([]);
});

test("every missing part is listed, in the order the person reads them", () => {
	expect(kinds({ localState: "not-ready", pendingChecks: 1, openFindings: 1, mergeable: "conflicting" })).toEqual([
		"not-asked",
		"checks-pending",
		"findings",
		"conflict",
	]);
});

test("the words count what is missing", () => {
	expect(reviewGapText({ kind: "checks-pending", count: 2 })).toBe("2 checks pending");
	expect(reviewGapText({ kind: "checks-failed", count: 1 })).toBe("1 check failed");
	expect(reviewGapText({ kind: "findings", count: 3 })).toBe("3 review findings open");
	expect(reviewGapText({ kind: "findings", count: 1 })).toBe("1 review finding open");
	expect(reviewGapText({ kind: "evidence", count: 1 })).toBe("no evidence document");
	expect(reviewGapText({ kind: "explanation", count: 1 })).toBe("no explanation for this commit");
	expect(reviewGapText({ kind: "flow-run", count: 1 })).toBe("no flow run finished for this pull request");
	expect(reviewGapText({ kind: "not-asked", count: 1 })).toBe("the agent has not asked for review");
	expect(reviewGapText({ kind: "conflict", count: 1 })).toBe("the pull request conflicts with its base branch");
});

// One linked pull request of a ticket. `ticketReviewGaps` reads `reviewGaps`
// alone, so the other fields stay out.
const linked = (reviewGaps: ReviewGap[]) => ({ reviewGaps });

const notAsked: ReviewGap[] = [{ kind: "not-asked", count: 1 }];
const failedCheck: ReviewGap[] = [{ kind: "checks-failed", count: 1 }];

test("the gaps of the badge keep the not-asked gap while one pull request waits for its agent", () => {
	const handedOverWithAFailedCheck = linked(failedCheck);
	const heldBack = linked(notAsked);

	const withTheFailedCheck = { reviewGaps: ticketReviewGaps([handedOverWithAFailedCheck, heldBack]) };
	const afterTheCheckPasses = { reviewGaps: ticketReviewGaps([linked([]), heldBack]) };

	expect(askedForReview(withTheFailedCheck)).toBe(false);
	expect(askedForReview(afterTheCheckPasses)).toBe(false);
});

test("the gaps of the badge read asked once the agent handed every pull request over", () => {
	const gaps = ticketReviewGaps([linked(failedCheck), linked([])]);

	expect(askedForReview({ reviewGaps: gaps })).toBe(true);
	// The failed check stays on the badge, so the row still names real work.
	expect(gaps).toEqual(failedCheck);
	expect(readyForReview({ reviewGaps: gaps })).toBe(false);
});

test("the gaps of the badge are empty when every pull request holds every part", () => {
	expect(ticketReviewGaps([linked([]), linked([])])).toEqual([]);
	expect(ticketReviewGaps([])).toEqual([]);
});

test("the gaps of the badge take the first pull request that the agent holds back", () => {
	expect(ticketReviewGaps([linked([]), linked(notAsked), linked(notAsked)])).toEqual(notAsked);
});

test("the state word reads queued, then the terminal state, then the review flag", () => {
	const open = { state: "open" as const, isQueued: false, reviewGaps: [] };

	expect(prStateWord(open)).toBe("open");
	expect(prStateWord({ ...open, reviewGaps: failedCheck })).toBe("open");
	expect(prStateWord({ ...open, reviewGaps: notAsked })).toBe("not ready");
	expect(prStateWord({ ...open, isQueued: true, reviewGaps: notAsked })).toBe("queued");
	expect(prStateWord({ ...open, state: "merged", reviewGaps: notAsked })).toBe("merged");
	expect(prStateWord({ ...open, state: "closed", reviewGaps: notAsked })).toBe("closed");
});

// The tooltip of the glyph prints this line under its own words. The check
// ribbon and the conflict mark draw their own facts, so the line leaves them
// out.
test("the missing parts name the review material and not the checks", () => {
	const parts = (facts: Partial<ReviewReadyFacts>) =>
		missingPartsText({ reviewGaps: reviewGaps({ ...ready, ...facts }) });

	expect(parts({})).toBeNull();
	expect(parts({ failedChecks: 2, pendingChecks: 1, mergeable: "conflicting" })).toBeNull();
	expect(parts({ localState: "not-ready" })).toBeNull();
	expect(parts({ hasEvidence: false })).toBe("no evidence document");
	expect(parts({ openFindings: 2 })).toBe("2 review findings open");
	expect(parts({ hasExplanation: false, hasEvidence: false, flowAnswered: false })).toBe(
		"no explanation for this commit, no evidence document, no flow run finished for this pull request",
	);
});

// A push takes the explanation and the evidence of the older commit away and
// leaves the local review state at `ready`.
test("a pull request with stale evidence stays asked for review and names the parts", () => {
	const afterAPush = { reviewGaps: reviewGaps({ ...ready, hasExplanation: false, hasEvidence: false }) };

	expect(askedForReview(afterAPush)).toBe(true);
	expect(readyForReview(afterAPush)).toBe(false);
	expect(missingPartsText(afterAPush)).toBe("no explanation for this commit, no evidence document");
});
