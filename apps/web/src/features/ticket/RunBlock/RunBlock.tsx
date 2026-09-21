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
	// The id of the run whose session sheet is open. The sheet opens only for
	// that run, so a later run never opens it.
	const [sessionRun, setSessionRun] = useState<string | null>(null);
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }),
		refetchInterval: 2000,
	});
	// The run line prints the time and the tokens on a hover.
	const metrics = useQuery({
		...orpc.agentRuns.ticketMetrics.queryOptions({ input: { ticket: ticket.identifier } }),
		refetchInterval: 2000,
	});
	// A link to `#attempt-<terminal id>` picks that run. Without one, the run
	// line shows the assigned agent run, then any run with a live process.
	const shown =
		runs.data?.find((run) => hash === `attempt-${run.terminalId}`) ??
		runs.data?.find((run) => run.kind === "agent" && run.assigned) ??
		runs.data?.find(hasAssignedProcess) ??
		null;
	// `apps/server/src/services/agentRuns/reserve.ts` refuses a start while an
	// agent run of the ticket is open, and `assigned` reads that same column.
	const canStart = runs.isSuccess && !runs.data.some((run) => run.kind === "agent" && run.assigned);
	return (
		<section aria-label="The run" className="flex min-w-0 flex-col">
			<SectionHeader title="The run" textCase="caps" />
			<div className="flex min-w-0 flex-col gap-3">
				{runs.isError ? (
					<p role="alert" className="text-sm text-danger">
						{runs.error.message}
					</p>
				) : runs.isPending ? (
					<div className="flex h-7 items-center">
						<Skeleton width="w-64" />
					</div>
				) : (
					<RunLine run={shown} metrics={metrics.data ?? null} onOpenSession={() => setSessionRun(shown?.id ?? null)} />
				)}
				{metrics.isError && (
					<p role="alert" className="text-sm text-danger">
						{metrics.error.message}
					</p>
				)}
				{canStart && <StartControls ticket={ticket.identifier} waitsOn={ticket.waitsOn} />}
			</div>
			{shown !== null && (
				<SessionSheet run={shown} open={shown.id === sessionRun} onClose={() => setSessionRun(null)} />
			)}
		</section>
	);
}
