import { Play } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { FlowRun } from "./components/FlowRun";
import { StartFlowDialog } from "./components/StartFlowDialog";

export function FlowRuns({ ticket }: { ticket: string }) {
	const { orpc } = useApp();
	const [start, setStart] = useState(false);
	const executions = useQuery({
		...orpc.flowExecutions.list.queryOptions({ input: { ticket } }),
		refetchInterval: 3000,
	});
	return (
		<section aria-label="Local flows" className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h3 className="text-sm font-medium">Local flows</h3>
				<Tooltip content="Start a local flow">
					<IconButton label="Start a local flow" icon={<Play />} onClick={() => setStart(true)} />
				</Tooltip>
			</div>
			{executions.isPending ? (
				<p role="status" className="text-sm text-fg-muted">
					Load flow runs…
				</p>
			) : executions.error ? (
				<p role="alert" className="text-sm text-danger">
					{executions.error.message}
				</p>
			) : executions.data.length === 0 ? (
				<EmptyState title="No local flow runs" description="Start a saved flow to run its steps for this ticket." />
			) : (
				executions.data.map((execution) => <FlowRun key={execution.id} execution={execution} />)
			)}
			{start && <StartFlowDialog ticket={ticket} onClose={() => setStart(false)} />}
		</section>
	);
}
