import type { LocalPrState } from "../schemas/enums.ts";

export type ReviewDraftFacts = { localState: LocalPrState };

// Every surface that draws the draft glyph or counts a review for the person
// reads the Trellis state that records whether the agent asked for review.
export const isReviewDraft = (pr: ReviewDraftFacts): boolean => pr.localState === "draft";
