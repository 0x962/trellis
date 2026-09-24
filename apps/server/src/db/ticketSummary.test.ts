import { expect, test } from "bun:test";
import { askedForReview, readyForReview, type TicketPr } from "@trellis/api";
import { foldedReviewGaps } from "./queries/ticketSummary.ts";

// One linked pull request. The tests read the review flag and the check
// counts alone, so the other fields stay out.
const pull = (number: number, reviewGaps: TicketPr["reviewGaps"]) => ({ number, reviewGaps }) as TicketPr;

const notAsked: TicketPr["reviewGaps"] = [{ kind: "not-asked", count: 1 }];
const failedCheck: TicketPr["reviewGaps"] = [{ kind: "checks-failed", count: 1 }];

test("the badge of a ticket stays not asked while one pull request waits for its agent", () => {
	const handedOverWithAFailedCheck = pull(11, failedCheck);
	const heldBack = pull(12, notAsked);

	const withTheFailedCheck = { reviewGaps: foldedReviewGaps([handedOverWithAFailedCheck, heldBack]) };
	const afterTheCheckPasses = { reviewGaps: foldedReviewGaps([pull(11, []), heldBack]) };

	expect(askedForReview(withTheFailedCheck)).toBe(false);
	expect(askedForReview(afterTheCheckPasses)).toBe(false);
});

test("the badge reads asked once the agent handed every pull request over", () => {
	const gaps = foldedReviewGaps([pull(11, failedCheck), pull(12, [])]);

	expect(askedForReview({ reviewGaps: gaps })).toBe(true);
	// The failed check stays on the badge, so the row still names real work.
	expect(gaps).toEqual(failedCheck);
	expect(readyForReview({ reviewGaps: gaps })).toBe(false);
});

test("the badge needs nothing when every pull request holds every part", () => {
	expect(foldedReviewGaps([pull(11, []), pull(12, [])])).toEqual([]);
	expect(foldedReviewGaps([])).toEqual([]);
});

test("the badge takes the first pull request that the agent holds back", () => {
	const gaps = foldedReviewGaps([pull(11, []), pull(12, notAsked), pull(13, notAsked)]);

	expect(gaps).toEqual(notAsked);
});
