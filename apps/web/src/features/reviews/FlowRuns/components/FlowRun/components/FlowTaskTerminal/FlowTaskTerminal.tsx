import { useQuery } from "@tanstack/react-query";
import type { FlowAttemptV1, FlowExecutionRecord } from "@trellis/api";
import { useApp } from "../../../../../../../lib/appContext";
import { NativeTerminal } from "../../../../../../agents/NativeTerminal";
import { FlowActionDialog } from "../../../StartFlowDialog/components/FlowActionDialog";

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
			<dl className="grid min-w-0 gap-2 break-all text-sm">
				<dt>Agent run</dt>
				<dd>{target.runId}</dd>
				<dt>Attempt</dt>
				<dd>{target.attemptId}</dd>
				<dt>Reviewed head</dt>
				<dd>{reviewedHead ?? "Unknown"}</dd>
				<dt>Workspace commit</dt>
				<dd>{attempt?.workspaceCommit ?? "Unknown"}</dd>
			</dl>
			{runs.isPending ? (
				<p role="status">Load task terminal…</p>
			) : runs.isError ? (
				<p role="alert" className="text-sm text-danger">
					{runs.error.message}
				</p>
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
						<p role="alert" className="text-sm text-danger">
							{retained.error.message}
						</p>
					) : (
						<section aria-label="Retained attempt output">
							<pre className="whitespace-pre-wrap break-words text-sm">{retained.data}</pre>
						</section>
					)}
				</>
			)}
		</FlowActionDialog>
	);
}
