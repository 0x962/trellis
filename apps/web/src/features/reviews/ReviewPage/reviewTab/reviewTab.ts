import type { Turn } from "@trellis/api";

// The four tabs of the review page. Overview holds the explanation of the
// change, the evidence document and the discussion. Checks holds
// the GitHub checks of the head commit. Flows holds the flow runs of the
// ticket. Diff holds the file tree and the diff.
export type ReviewTab = "overview" | "checks" | "flows" | "diff";

const tabs: readonly ReviewTab[] = ["overview", "checks", "flows", "diff"];

// The `tab` value of a review URL, or undefined for a missing or unknown one.
// A link written before the four tabs carries `facts`, the name of the tab
// that Overview replaced.
export const reviewTabOf = (value: unknown): ReviewTab | undefined =>
	value === "facts" ? "overview" : tabs.find((tab) => tab === value);

// The tab a review opens on when its URL names none. A pull request that
// waits for the person opens on its code. Any other pull request opens on its
// overview, which says who acts next. `turn` is null while the ticket row and
// the pull request row load, and the review then opens on its code.
export const defaultReviewTab = (turn: Turn | null): ReviewTab =>
	turn === null || turn === "you" ? "diff" : "overview";
