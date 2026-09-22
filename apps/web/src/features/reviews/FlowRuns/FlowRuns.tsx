import { Play } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, IconButton, SectionHeader, Skeleton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { FlowRun } from "./components/FlowRun";
import { StartFlowDialog } from "./components/StartFlowDialog";

const isLive = (status: string) => status === "running" || status === "waiting";

// The flow runs of the ticket that owns the pull request, newest first. A
// live run and the newest run open with their steps. An older run opens on
// its name. The list refreshes on the flows.changed event of the live
// connection.
export function FlowRuns({ ticket }: { ticket: string }) {
	const { orpc } = useApp();
	const [start, setStart] = useState(false);
	// The runs whose open state differs from the default.
	const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
	const executions = useQuery(orpc.flowExecutions.list.queryOptions({ input: { ticket } }));
	const toggle = (id: string) =>
		setToggled((previous) => {
			const next = new Set(previous);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const anyLive = executions.data?.some((execution) => isLive(execution.state.status)) ?? false;
	return (
		<section aria-label="Flows" className="flex flex-col gap-4">
			<SectionHeader
				title="Flows"
				textCase="caps"
				count={executions.data?.length}
				actions={
					<Tooltip content="Start a flow">
						<IconButton label="Start a flow" icon={<Play />} onClick={() => setStart(true)} />
					</Tooltip>
				}
			/>
			{executions.isPending ? (
				<div role="status" aria-label="Load flow runs">
					<span className="sr-only">Load flow runs</span>
					<Skeleton lines={3} height="h-9" />
				</div>
			) : executions.isError ? (
				<EmptyState title="Could not load flow runs" description={executions.error.message} />
			) : executions.data.length === 0 ? (
				<EmptyState title="No flow runs" description="Start a saved flow to run its steps against this ticket." />
			) : (
				<div className="flex flex-col gap-6">
					{executions.data.map((execution, index) => {
						const open = isLive(execution.state.status) || index === 0;
						return (
							<FlowRun
								key={execution.id}
								execution={execution}
								ticket={ticket}
								expanded={toggled.has(execution.id) ? !open : open}
								onToggle={() => toggle(execution.id)}
								canStart={!anyLive}
							/>
						);
					})}
				</div>
			)}
			{start && <StartFlowDialog ticket={ticket} onClose={() => setStart(false)} />}
		</section>
	);
}
