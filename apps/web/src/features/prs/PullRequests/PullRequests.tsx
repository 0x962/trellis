import type { TicketSummary } from "@trellis/api";

export type PullRequestsProps = {
	ticket: TicketSummary;
};

// Every pull request linked to one ticket, with the gh banner, the fetch age,
// and the Link PR field. The ticket page mounts this and nothing else.
export function PullRequests(_props: PullRequestsProps) {
	return null;
}
