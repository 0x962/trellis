import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { EmptyState, SectionHeader, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { OutcomeBlock } from "../OutcomeBlock";
import { RunLine } from "../RunLine";
import { StartControls } from "../StartControls";
import { FlowRuns } from "./components/FlowRuns";
import { PullRequestCard } from "./components/PullRequestCard";
import { SessionSheet } from "./components/SessionSheet";

export type TicketWorkAreaProps = {
	ticket: Ticket;
	onOpenPullRequest: (url: string) => void;
};

// The three regions of the ticket page under the chain, in reading order: the
// evidence, the outcome and the run. The proof sits above the process.
export function TicketWorkArea({ ticket, onOpenPullRequest }: TicketWorkAreaProps) {
	const { orpc } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const [sessionOpen, setSessionOpen] = useState(false);
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: ticket.prs,
	}).data;
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }),
		refetchInterval: 2000,
	});
	// The run line prints the time and the tokens on a hover.
	const metrics = useQuery({
		...orpc.agentRuns.ticketMetrics.queryOptions({ input: { ticket: ticket.identifier }, retry: false }),
		refetchInterval: 2000,
	});
	// A link to `#attempt-<terminal id>` picks that run. Without one, the run
	// line shows the assigned agent run, then any run with a live process.
	const assigned =
		runs.data?.find((run) => hash === `attempt-${run.terminalId}`) ??
		runs.data?.find((run) => run.kind === "agent" && run.assigned) ??
		runs.data?.find(hasAssignedProcess) ??
		null;
	// A person starts a run on an open ticket that no live process holds.
	const canStart =
		runs.isSuccess && ticket.completedAt === null && (assigned === null || !hasAssignedProcess(assigned));
	return (
		<>
			<section aria-label="The evidence" className="flex min-w-0 flex-col gap-3">
				<SectionHeader title="THE EVIDENCE" />
				{prs.length === 0 ? (
					<EmptyState description="No pull request yet." />
				) : (
					prs.map((pr) => <PullRequestCard key={pr.id} ticket={ticket} pr={pr} onOpen={onOpenPullRequest} />)
				)}
				{/* A flow run belongs to the ticket and not to one pull request, so the
				    list draws once, under the pull request cards. */}
				<FlowRuns ticket={ticket.identifier} />
			</section>
			<OutcomeBlock outcome={ticket.outcome} />
			<div className="flex min-w-0 flex-col gap-3">
				<SectionHeader title="THE RUN" />
				{runs.isError ? (
					<p role="alert" className="text-sm text-danger">
						{runs.error.message}
					</p>
				) : runs.isPending ? (
					<Skeleton width="w-64" />
				) : (
					<RunLine run={assigned} metrics={metrics.data ?? null} onOpenSession={() => setSessionOpen(true)} />
				)}
				{canStart && <StartControls ticket={ticket.identifier} waitsOn={ticket.waitsOn} />}
			</div>
			{assigned !== null && <SessionSheet run={assigned} open={sessionOpen} onClose={() => setSessionOpen(false)} />}
		</>
	);
}
