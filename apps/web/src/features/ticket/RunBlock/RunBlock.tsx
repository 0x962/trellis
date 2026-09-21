import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { type AgentRun, hasAssignedProcess, messageTarget, runLine, type Ticket } from "@trellis/api";
import { SectionHeader, Skeleton } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { RunLine } from "../RunLine";
import { StartControls } from "../StartControls";
import { MessageAgent } from "./components/MessageAgent";

export type RunBlockProps = {
	ticket: Ticket;
};

export const canStartRun = (
	ticket: Pick<Ticket, "completedAt">,
	runs: readonly Pick<AgentRun, "kind" | "assigned">[],
) => ticket.completedAt === null && !runs.some((run) => run.kind === "agent" && run.assigned);

export const canRetryRun = (run: AgentRun | null) => {
	if (run === null || run.kind !== "agent" || !run.assigned || run.terminalId === null) return false;
	return ["failed", "lost"].includes(runLine(run).kind);
};

// The run that holds the ticket, the controls that start one, and the form
// that sends a message to the agent while it runs.
export function RunBlock({ ticket }: RunBlockProps) {
	const { client, orpc, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
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
	const retry = useMutation({
		mutationFn: () =>
			client.agentRuns.retry({
				id: shown!.id,
				expectedTerminalId: shown!.terminalId!,
				requestId: crypto.randomUUID(),
			}),
		onSuccess: (run) => {
			queryClient.setQueryData(
				orpc.agentRuns.list.queryOptions({ input: { ticket: ticket.identifier } }).queryKey,
				(current) => [run, ...(current ?? []).filter((item) => item.id !== run.id)],
			);
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
		},
	});
	const retryProps = canRetryRun(shown)
		? { starting: retry.isPending, error: retry.error?.message ?? null, onRetry: () => retry.mutate() }
		: null;
	const canStart = runs.isSuccess && canStartRun(ticket, runs.data);
	const target = runs.isSuccess ? messageTarget(runs.data) : null;
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
					<RunLine
						run={shown}
						metrics={metrics.data ?? null}
						retry={retryProps}
						onOpenSession={() => shown !== null && pageSheetActions.openSession(shown.id)}
					/>
				)}
				{metrics.isError && (
					<p role="alert" className="text-sm text-danger">
						{metrics.error.message}
					</p>
				)}
				{target !== null && <MessageAgent key={target.id} run={target} />}
				{canStart && <StartControls ticket={ticket.identifier} waitsOn={ticket.waitsOn} />}
			</div>
		</section>
	);
}
