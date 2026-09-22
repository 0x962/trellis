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

export const defaultReviewTab: ReviewTab = "overview";

export const initialReviewTab = (urlTab: ReviewTab | undefined, lastTab: ReviewTab | null | undefined): ReviewTab =>
	urlTab ?? lastTab ?? defaultReviewTab;
