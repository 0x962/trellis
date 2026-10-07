import { useQuery } from "@tanstack/react-query";
import type { FlowAttemptV1, FlowExecutionRecord } from "@trellis/api";
import { FailureState, OutputBlock, PropertyRow } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { NativeTerminal } from "../../../../../../agents/NativeTerminal";
import { useFlowRecovery } from "../../../../useFlowRecovery";
import { FlowActionDialog } from "../../../FlowActionDialog";

export function FlowTaskTerminal({
	executionId,
	task,
	attempt,
	stepTitle = "Flow task",
	reviewedHead,
	recoveryBlocked,
	onClose,
}: {
	executionId: string;
	task: FlowExecutionRecord["tasks"][number];
	attempt?: FlowAttemptV1;
	stepTitle?: string;
	reviewedHead?: string | null;
	recoveryBlocked?: boolean;
	onClose: () => void;
}) {
	const { client, orpc } = useApp();
	const { blocked: recovery } = useFlowRecovery(recoveryBlocked);
	const target = attempt
		? { runId: attempt.agentRunId, attemptId: attempt.attemptId, resultId: attempt.resultId }
		: task;
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: [target.runId] } }),
		refetchInterval: 2000,
	});
	const run = runs.data?.items.find((item) => item.id === target.runId && item.terminalId === target.attemptId);
	const binding =
		attempt && attempt.resultId !== null
			? {
					executionId,
					stepId: attempt.stepId,
					agentRunId: attempt.agentRunId,
					attemptId: attempt.attemptId,
					resultId: attempt.resultId,
				}
			: null;
	const retained = useQuery({
		queryKey: ["flow-attempt-output", binding],
		queryFn: () => client.flowExecutionsV1.output(binding!),
		enabled: binding !== null && !runs.isPending && !run,
	});
	return (
		<FlowActionDialog title={`${stepTitle} terminal`} onClose={onClose}>
			<div className="flex min-w-0 flex-col gap-0.5">
				<p className="text-sm font-medium text-fg">{stepTitle}</p>
				<p className="text-sm text-fg-muted">
					Result ID: <span className="break-all font-mono">{target.resultId ?? "Pending"}</span>
				</p>
			</div>
			<details className="text-xs text-fg-muted">
				<summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
					Technical details
				</summary>
				<dl className="mt-2 min-w-0">
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
			</details>
			{runs.isPending ? (
				<p role="status">Load task terminal…</p>
			) : runs.isError ? (
				<FailureState title="The terminal is unavailable" detail={runs.error.message} />
			) : run ? (
				<NativeTerminal key={`${target.runId}:${target.attemptId}`} run={run} readOnly={recovery} />
			) : (
				<>
					<p role="status">This attempt is no longer attached to this assignment.</p>
					{binding === null ? (
						<p role="status">Retained output for this exact attempt is unavailable.</p>
					) : retained.isPending ? (
						<p role="status">Load retained output…</p>
					) : retained.isError ? (
						<FailureState title="The retained output is unavailable" detail={retained.error.message} />
					) : retained.data.output === null ? (
						<p role="status">The host has no retained output for this exact result.</p>
					) : (
						<section aria-label="Retained attempt output" className="flex min-w-0 flex-col gap-2">
							<p className="text-sm text-fg-muted">
								This saved output came from the shown attempt and result for {stepTitle}.
							</p>
							<OutputBlock text={retained.data.output} />
						</section>
					)}
				</>
			)}
		</FlowActionDialog>
	);
}
