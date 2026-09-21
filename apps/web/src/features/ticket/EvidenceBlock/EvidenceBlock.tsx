import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { EmptyState, SectionHeader } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { FlowRuns } from "./components/FlowRuns";
import { PullRequestCard } from "./components/PullRequestCard";

export type EvidenceBlockProps = {
	ticket: Ticket;
	onOpenPullRequest: (url: string) => void;
};

// One card for each pull request of the ticket, then the flow runs. A flow run
// belongs to the ticket and not to one pull request, so the list draws once,
// under the cards.
export function EvidenceBlock({ ticket, onOpenPullRequest }: EvidenceBlockProps) {
	const { orpc } = useApp();
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: ticket.prs,
	});
	return (
		<section aria-label="The evidence" className="flex min-w-0 flex-col">
			<SectionHeader title="The evidence" textCase="caps" />
			<div className="flex min-w-0 flex-col gap-3">
				{prs.isError && (
					<p role="alert" className="text-sm text-danger">
						{prs.error.message}
					</p>
				)}
				{prs.data.length === 0 ? (
					<EmptyState description="No pull request yet." />
				) : (
					prs.data.map((pr) => <PullRequestCard key={pr.id} ticket={ticket} pr={pr} onOpen={onOpenPullRequest} />)
				)}
				<FlowRuns ticket={ticket.identifier} />
			</div>
		</section>
	);
}
