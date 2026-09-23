import { expect, test } from "bun:test";
import { firstReviewGapText, type ReviewReadyFacts, readyForReview, reviewGaps, reviewGapText } from "./reviewReady.ts";

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
	expect(firstReviewGapText({ reviewGaps: reviewGaps(ready) })).toBeNull();
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

test("the glyph reads the first missing part", () => {
	const gaps = reviewGaps({ ...ready, pendingChecks: 2, openFindings: 1 });
	expect(firstReviewGapText({ reviewGaps: gaps })).toBe("2 checks pending");
});
