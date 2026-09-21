import { GitDiff } from "@phosphor-icons/react";
import type { LinkedPullRequest, Ticket } from "@trellis/api";
import { EmptyState, IconButton, Tooltip } from "@trellis/ui";
import { PullRequestRow } from "../../../../prs";
import { prConditions, ShortConditions } from "../../../../reviews/ConditionsBlock";

export type PullRequestCardProps = {
	ticket: Ticket;
	pr: LinkedPullRequest;
	onOpen: (url: string) => void;
};

export function PullRequestCard({ ticket, pr, onOpen }: PullRequestCardProps) {
	// `pullRequests.list` can hold a pull request that was linked after the
	// ticket record loaded, so the ticket row for it can be missing until the
	// ticket refetches.
	const row = ticket.prRows.find((candidate) => candidate.url === pr.url);
	const conditions = row === undefined ? null : prConditions(row, ticket.waitsOn);
	return (
		<article aria-label={`Pull request #${pr.number}`} className="overflow-hidden rounded-md border border-border">
			<PullRequestRow ticket={ticket} pr={pr} />
			<div className="flex min-w-0 items-start gap-2 border-t border-border px-5 py-3 max-md:px-4">
				<div className="min-w-0 flex-1">
					{conditions === null ? (
						<EmptyState description="Trellis has not read the changed files of this pull request yet." />
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
