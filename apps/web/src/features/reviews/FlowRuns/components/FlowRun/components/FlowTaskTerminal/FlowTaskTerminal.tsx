import { useQuery } from "@tanstack/react-query";
import type { FlowAttemptV1, FlowExecutionRecord } from "@trellis/api";
import { FailureState, OutputBlock, PropertyRow } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { NativeTerminal } from "../../../../../../agents/NativeTerminal";
import { FlowActionDialog } from "../../../FlowActionDialog";

type Target = { runId: string; attemptId: string; resultId: string | null };

export function FlowTaskTerminal({
	task,
	attempt,
	reviewedHead,
	recoveryBlocked,
	readRetainedOutput,
	onClose,
}: {
	task: FlowExecutionRecord["tasks"][number];
	attempt?: FlowAttemptV1;
	reviewedHead?: string | null;
	recoveryBlocked?: boolean;
	readRetainedOutput?: (target: Target) => Promise<string>;
	onClose: () => void;
}) {
	const { orpc } = useApp();
	const target = attempt
		? { runId: attempt.agentRunId, attemptId: attempt.attemptId, resultId: attempt.resultId }
		: task;
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: [target.runId] } }),
		refetchInterval: 2000,
	});
	const run = runs.data?.items.find((item) => item.id === target.runId && item.terminalId === target.attemptId);
	const retained = useQuery({
		queryKey: ["flow-attempt-output", target.runId, target.attemptId, target.resultId],
		queryFn: () => readRetainedOutput!(target),
		enabled: !!readRetainedOutput && !runs.isPending && !run,
	});
	return (
		<FlowActionDialog title="Flow task terminal" onClose={onClose}>
			<dl className="min-w-0 text-sm">
				<PropertyRow label="Agent run">
					<span className="min-w-0 break-all">{target.runId}</span>
				</PropertyRow>
				<PropertyRow label="Attempt">
					<span className="min-w-0 break-all">{target.attemptId}</span>
				</PropertyRow>
				<PropertyRow label="Reviewed head">
					<span className="min-w-0 break-all">{reviewedHead ?? "Unknown"}</span>
				</PropertyRow>
				<PropertyRow label="Workspace commit">
					<span className="min-w-0 break-all">{attempt?.workspaceCommit ?? "Unknown"}</span>
				</PropertyRow>
			</dl>
			{runs.isPending ? (
				<p role="status">Load task terminal…</p>
			) : runs.isError ? (
				<div role="alert">
					<FailureState title="The terminal is unavailable" detail={runs.error.message} />
				</div>
			) : run ? (
				<NativeTerminal key={`${target.runId}:${target.attemptId}`} run={run} readOnly={recoveryBlocked ?? !!attempt} />
			) : (
				<>
					<p role="status">This attempt is no longer attached to this assignment.</p>
					{!readRetainedOutput ? (
						<p role="status">Retained output for this exact attempt is unavailable.</p>
					) : retained.isPending ? (
						<p role="status">Load retained output…</p>
					) : retained.isError ? (
						<div role="alert">
							<FailureState title="The retained output is unavailable" detail={retained.error.message} />
						</div>
					) : (
						<section aria-label="Retained attempt output">
							<OutputBlock text={retained.data} />
						</section>
					)}
				</>
			)}
		</FlowActionDialog>
	);
}
