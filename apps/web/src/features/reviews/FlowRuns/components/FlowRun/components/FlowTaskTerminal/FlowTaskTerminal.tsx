import { X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { FlowExecutionRecord } from "@trellis/api";
import { Dialog, FailureState, IconButton, Tooltip } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { NativeTerminal } from "../../../../../../agents/NativeTerminal";

export function FlowTaskTerminal({
	task,
	stepTitle,
	onClose,
}: {
	task: FlowExecutionRecord["tasks"][number];
	stepTitle: string;
	onClose: () => void;
}) {
	const { orpc } = useApp();
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: task.runId ? [task.runId] : [] } }),
		refetchInterval: 2000,
	});
	const run = runs.data?.items.find((item) => item.id === task.runId && item.terminalId === task.attemptId);
	return (
		<Dialog
			open
			title={`${stepTitle} terminal`}
			size="lg"
			className="w-full max-w-5xl"
			onOpenChange={(open) => !open && onClose()}
			header={
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-md font-semibold">{stepTitle} terminal</h2>
					<Tooltip content="Close terminal">
						<IconButton label="Close terminal" icon={<X />} onClick={onClose} />
					</Tooltip>
				</div>
			}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<p className="text-sm font-medium text-fg">{stepTitle}</p>
				<p className="text-sm text-fg-muted">
					Result ID: <span className="break-all font-mono">{task.resultId ?? "Pending"}</span>
				</p>
			</div>
			<details className="text-xs text-fg-muted">
				<summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
					Technical details
				</summary>
				<dl className="mt-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
					<dt>Agent run</dt>
					<dd className="break-all font-mono">{task.runId}</dd>
					<dt>Attempt</dt>
					<dd className="break-all font-mono">{task.attemptId}</dd>
				</dl>
			</details>
			{runs.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load task terminal…
				</p>
			) : runs.isError ? (
				<FailureState title="The terminal is unavailable" detail={runs.error.message} />
			) : run ? (
				<NativeTerminal key={task.attemptId} run={run} />
			) : (
				<p role="alert" className="text-sm text-danger">
					This task's terminal is no longer attached to this assignment.
				</p>
			)}
		</Dialog>
	);
}
