import type { PullRequest, TicketSummary } from "@trellis/api";

export type MergedNudgeProps = {
	ticket: TicketSummary;
	pr: PullRequest;
};

// The offer to finish a ticket whose pull request is merged. The person
// decides: nothing moves the ticket until the button is pressed.
export function MergedNudge(_props: MergedNudgeProps) {
	return null;
}
