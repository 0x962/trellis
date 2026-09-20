import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { SectionHeader, Skeleton } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { hasAssignedProcess } from "../../agents/hasAssignedProcess";
import { RunLine } from "../RunLine";
import { StartControls } from "../StartControls";
import { SessionSheet } from "./components/SessionSheet";

export type RunBlockProps = {
	ticket: Ticket;
};

// The run that holds the ticket, and the controls that start one.
export function RunBlock({ ticket }: RunBlockProps) {
	const { orpc } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const [sessionOpen, setSessionOpen] = useState(false);
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
			{assigned !== null && <SessionSheet run={assigned} open={sessionOpen} onClose={() => setSessionOpen(false)} />}
		</div>
	);
}
