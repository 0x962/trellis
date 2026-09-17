import { useQuery } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { EmptyState, Skeleton } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { PullRequestRow } from "./components/PullRequestRow";

export type PullRequestsProps = {
	ticket: TicketSummary;
	onOpen: (url: string) => void;
	// The rows a cached ticket detail already holds. With them, the section
	// paints at once and shows no skeleton while `pullRequests.list` loads.
	initialPrs?: LinkedPullRequest[];
};

// The server polls GitHub and puts every change on the event stream. The
// list follows a `pr.updated` event on its own, so the rows stay current
// without a click.
export function PullRequests({ ticket, onOpen, initialPrs }: PullRequestsProps) {
	const { orpc } = useApp();
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: initialPrs,
	}).data;

	return (
		<section aria-label="PRs" className="flex flex-col gap-2">
			{prs === undefined ? (
				<div data-pr-skeleton="" className="flex h-14 items-center rounded-md border border-border bg-surface px-3">
					<Skeleton width="w-64" />
				</div>
			) : prs.length === 0 ? (
				<EmptyState title="No pull requests" description="This ticket has no linked pull requests." />
			) : (
				<ul className="overflow-hidden rounded-md border border-border">
					{prs.map((pr) => (
						<li key={pr.id} className="border-b border-border last:border-b-0">
							<PullRequestRow ticket={ticket} pr={pr} onOpen={onOpen} />
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
