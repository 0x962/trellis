import type { Turn } from "@trellis/api";

// The two tabs of the review page. Facts holds everything that is not code,
// and Diff holds the file tree and the diff.
export type ReviewTab = "facts" | "diff";

// The `tab` value of a review URL, or undefined for a missing or unknown one.
export const reviewTabOf = (value: unknown): ReviewTab | undefined =>
	value === "facts" || value === "diff" ? value : undefined;

// The tab a review opens on when its URL names none. A pull request that
// waits for the person opens on its code. Any other pull request opens on
// its facts, which say who acts next. `turn` is null while the ticket row and
// the pull request row load, and the review then opens on its code.
export const defaultReviewTab = (turn: Turn | null): ReviewTab => (turn === null || turn === "you" ? "diff" : "facts");
