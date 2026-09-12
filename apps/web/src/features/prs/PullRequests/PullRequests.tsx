import { Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { Button, SectionHeader, Skeleton } from "@trellis/ui";
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

// Every PR linked to one ticket. The header row holds the count and the plus
// button that opens the Link PR modal. With no PR the section is that header
// row alone. The gh notice shows only above a PR, because checks exist only
// on a linked PR. The ticket page mounts this and nothing else.
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
			<div data-prs-header="">
				<SectionHeader
					title="PRs"
					count={prs !== undefined && prs.length > 0 ? prs.length : undefined}
					actions={
						<Button variant="quiet" size="sm" icon={<Plus />} onClick={() => setLinking(true)}>
							Add
						</Button>
					}
				/>
			</div>
			<LinkPrDialog ticket={ticket} open={linking} onOpenChange={setLinking} />
			{prs === undefined ? (
				<div data-pr-skeleton="" className="flex h-14 items-center rounded-md border border-border bg-surface px-3">
					<Skeleton width="w-64" />
				</div>
			) : (
				prs.length > 0 && (
					<>
						<GhBanner />
						<ul className="flex flex-col gap-1">
							{prs.map((pr) => (
								<li key={pr.id}>
									<PullRequestRow ticket={ticket} pr={pr} />
								</li>
							))}
						</ul>
					</>
				)
			)}
		</section>
	);
}
