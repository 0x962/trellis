import { X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { FlowExecutionRecord } from "@trellis/api";
import { Dialog, IconButton, Tooltip } from "@trellis/ui";
import { useApp } from "../../../../../../../lib/appContext";
import { NativeTerminal } from "../../../../../../agents/NativeTerminal";

export function FlowTaskTerminal({
	task,
	onClose,
}: {
	task: FlowExecutionRecord["tasks"][number];
	onClose: () => void;
}) {
	const { orpc } = useApp();
	const runs = useQuery({
		...orpc.agentRuns.list.queryOptions({ input: { ids: task.runId ? [task.runId] : [] } }),
		refetchInterval: 2000,
	});
	const run = runs.data?.find((item) => item.id === task.runId && item.terminalId === task.attemptId);
	return (
		<Dialog
			open
			title="Flow task terminal"
			size="lg"
			className="w-full max-w-5xl"
			onOpenChange={(open) => !open && onClose()}
			header={
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-md font-semibold">Flow task terminal</h2>
					<Tooltip content="Close terminal">
						<IconButton label="Close terminal" icon={<X />} onClick={onClose} />
					</Tooltip>
				</div>
			}
		>
			{runs.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load task terminal…
				</p>
			) : runs.isError ? (
				<p role="alert" className="text-sm text-danger">
					{runs.error.message}
				</p>
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
