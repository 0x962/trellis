import type { LocalPrState } from "../schemas/enums.ts";

export type ReviewDraftFacts = { isDraft: boolean; localState: LocalPrState };

// An open pull request waits for its agent while GitHub marks it as a draft
// or while its local state is `draft`. The person reviews it only when both
// say ready. Every surface that draws the draft glyph or counts a review for
// the person reads this rule.
export const isReviewDraft = (pr: ReviewDraftFacts): boolean => pr.isDraft || pr.localState === "draft";
