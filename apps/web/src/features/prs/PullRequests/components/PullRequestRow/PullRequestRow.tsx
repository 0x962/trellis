import type { LinkedPullRequest, TicketSummary } from "@trellis/api";

export type PullRequestRowProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// One pull request: the state, the ribbon, the counts, the review state, the
// branch pair, and who linked it. The header expands to the per-check rows.
export function PullRequestRow(_props: PullRequestRowProps) {
	return null;
}
