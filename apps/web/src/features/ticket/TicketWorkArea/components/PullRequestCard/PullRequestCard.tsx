import { GitDiff } from "@phosphor-icons/react";
import type { LinkedPullRequest, Ticket } from "@trellis/api";
import { IconButton, Tooltip } from "@trellis/ui";
import { PullRequestRow } from "../../../../prs/PullRequests/components/PullRequestRow";
import { ShortConditions } from "../../../../reviews/ConditionsBlock";
import { prConditions } from "./prConditions";

export type PullRequestCardProps = {
	ticket: Ticket;
	pr: LinkedPullRequest;
	onOpen: (url: string) => void;
};

// One pull request of the ticket: its row, and under it the short form of the
// merge conditions with the button that opens the review.
export function PullRequestCard({ ticket, pr, onOpen }: PullRequestCardProps) {
	const row = ticket.prRows.find((candidate) => candidate.url === pr.url);
	const conditions = row === undefined ? null : prConditions(row, ticket.waitsOn);
	return (
		<article aria-label={`Pull request #${pr.number}`} className="overflow-hidden rounded-md border border-border">
			<PullRequestRow ticket={ticket} pr={pr} onOpen={onOpen} />
			<div className="flex min-w-0 items-start gap-2 border-t border-border px-5 py-3 max-md:px-4">
				<div className="min-w-0 flex-1">
					{conditions === null ? (
						<p className="text-sm text-fg-muted">The file list of this pull request has not arrived.</p>
					) : (
						<ShortConditions conditions={conditions} />
					)}
				</div>
				<Tooltip content="Open the review">
					<IconButton label="Open the review" icon={<GitDiff />} onClick={() => onOpen(pr.url)} />
				</Tooltip>
			</div>
		</article>
	);
}
