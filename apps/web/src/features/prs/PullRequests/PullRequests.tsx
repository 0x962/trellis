import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { Button, EmptyState, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { GhBanner } from "./components/GhBanner";
import { LinkPrDialog } from "./components/LinkPrDialog";
import { PullRequestRow } from "./components/PullRequestRow";

export type PullRequestsProps = {
	ticket: TicketSummary;
	// The rows a cached ticket detail already holds. With them, the section
	// paints at once and shows no skeleton while `pullRequests.list` loads.
	initialPrs?: LinkedPullRequest[];
};

// The ticket Changes tab supplies the name for this list of PR cards. The Add
// button above the cards is the only control that opens the Link PR modal. The
// gh notice shows only above a PR, because checks exist only on a linked PR.
//
// The server polls GitHub and puts every change on the event stream. The
// list follows a `pr.updated` event on its own, so the rows stay current
// without a click.
export function PullRequests({ ticket, initialPrs }: PullRequestsProps) {
	const { orpc } = useApp();
	const [linking, setLinking] = useState(false);
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: initialPrs,
	}).data;

	return (
		<section aria-label="PRs" className="flex flex-col gap-2">
			{/* The row is 28 px tall, the height of a ticket section header, so
			    the cards start at the same height as the rows of every other
			    section on the ticket. */}
			<div className="flex h-7 items-center justify-end">
				<Button variant="quiet" size="sm" icon={<Plus />} onClick={() => setLinking(true)}>
					Add
				</Button>
			</div>
			<LinkPrDialog ticket={ticket} open={linking} onOpenChange={setLinking} />
			{prs === undefined ? (
				<div data-pr-skeleton="" className="flex h-14 items-center rounded-md border border-border bg-surface px-3">
					<Skeleton width="w-64" />
				</div>
			) : prs.length === 0 ? (
				<EmptyState description="Add a pull request to track its review and checks." />
			) : (
				<>
					<GhBanner />
					<ul className="overflow-hidden rounded-md border border-border">
						{prs.map((pr) => (
							<li key={pr.id} className="border-b border-border last:border-b-0">
								<PullRequestRow ticket={ticket} pr={pr} />
							</li>
						))}
					</ul>
				</>
			)}
		</section>
	);
}
