import { ArrowsClockwise, FlowArrow, Stop } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FlowExecutionRecord } from "@trellis/api";
import { Avatar, ConfirmDialog, FlowRunSummary, FlowRunTree, IconButton, Tooltip, toast } from "@trellis/ui";
import { useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { relativeTime } from "../../../../../lib/format";
import { agentKindOf } from "../../../../agents/agentKindOf";
import { agentProfileOf } from "../../../../agents/agentProfileOf";
import { isAgentWorking } from "../../../../agents/isAgentWorking";
import { useClock } from "../../useClock";
import { buildFlowRunRows } from "./buildFlowRunRows";
import { FlowDecisionDialog } from "./components/FlowDecisionDialog";
import { FlowTaskTerminal } from "./components/FlowTaskTerminal";
import { flowRunNotice } from "./flowRunNotice";

// A run ends when its last step became final. A run stored before steps
// kept that time ends at its last state write.
const endOf = (execution: FlowExecutionRecord) =>
	Math.max(execution.state.updatedAt, ...execution.state.steps.map((step) => step.endedAt ?? 0));

export function FlowRun({
	execution,
	ticket,
	expanded,
	onToggle,
	canStart,
	headSha,
}: {
	execution: FlowExecutionRecord;
	ticket: string;
	expanded: boolean;
	onToggle: () => void;
	// No run of the ticket is live, so this one can run again.
	canStart: boolean;
	// The commit the pull request points at now, which a new run stores.
	headSha: string | null;
}) {
	const { client, orpc, queryClient } = useApp();
	const { doc, state } = execution;
	const live = state.status === "running" || state.status === "waiting";
	const now = useClock(live);
	const runs = useQuery(orpc.agentRuns.list.queryOptions({ input: { ticket } }));
	const rows = useMemo(() => buildFlowRunRows(execution), [execution]);
	const [decision, setDecision] = useState<string | null>(null);
	const [terminal, setTerminal] = useState<FlowExecutionRecord["tasks"][number] | null>(null);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.flowExecutions.list.key() });
	const cancel = useMutation({
		mutationFn: () => client.flowExecutions.cancel({ id: execution.id, expectedRevision: execution.revision }),
		onSuccess: async () => {
			setConfirmCancel(false);
			await refresh();
		},
		onError: async (error) => {
			toast.error(error.message);
			await refresh();
		},
	});
	// The flow runs at its current saved version, which can be newer than the
	// version of this run.
	const runAgain = useMutation({
		mutationFn: async () => {
			const current = await client.flows.get({ flow: execution.flowId });
			return client.flowExecutions.start({
				flow: execution.flowId,
				ticket,
				...(headSha === null ? {} : { headSha }),
				requestId: crypto.randomUUID(),
				expectedVersion: current.flow.version,
			});
		},
		onSuccess: async () => {
			await refresh();
			toast.success(`${doc.flow.name} started`);
		},
		onError: (error) => toast.error(error.message),
	});
	const taskOf = (key: string) => {
		const actionKey = rows.find((row) => row.key === key)?.actionKey;
		return execution.tasks.find((task) => task.key === actionKey) ?? null;
	};
	const withActors = rows.map((row) => {
		const task = row.actionKey === null ? null : execution.tasks.find((task) => task.key === row.actionKey);
		const run = task ? runs.data?.find((run) => run.id === task.runId) : undefined;
		if (!run) return row;
		return {
			...row,
			actor: (
				<Avatar
					kind="agent"
					name={run.name}
					agentKind={agentKindOf(run.kind)}
					agentProfile={agentProfileOf(run.harness)}
					state={isAgentWorking(run) ? "working" : "static"}
				/>
			),
		};
	});
	return (
		<section aria-label={`${doc.flow.name} run`} className="flex min-w-0 flex-col gap-3">
			<FlowRunSummary
				name={doc.flow.name}
				version={state.flowVersion}
				status={state.status}
				startedAt={state.startedAt}
				startedLabel={relativeTime(new Date(state.startedAt).toISOString())}
				durationMs={(live ? now : endOf(execution)) - state.startedAt}
				notice={flowRunNotice(execution, rows)}
				expanded={expanded}
				onToggle={onToggle}
				actions={
					<>
						{live && (
							<Tooltip content="Cancel this run">
								<IconButton label="Cancel this run" icon={<Stop />} onClick={() => setConfirmCancel(true)} />
							</Tooltip>
						)}
						{!live && canStart && (
							<Tooltip content={`Run ${doc.flow.name} again`}>
								<IconButton
									label={`Run ${doc.flow.name} again`}
									icon={<ArrowsClockwise />}
									disabled={runAgain.isPending}
									onClick={() => runAgain.mutate()}
								/>
							</Tooltip>
						)}
						<Tooltip content={`Open ${doc.flow.name} in the editor`}>
							<IconButton
								label={`Open ${doc.flow.name} in the editor`}
								icon={<FlowArrow />}
								render={<Link to="/ai/flows/$slug" params={{ slug: doc.flow.slug }} />}
							/>
						</Tooltip>
					</>
				}
			/>
			{expanded && (
				<>
					{state.steps.some((step) => step.needsStop) && (
						<p role="status" className="text-sm text-danger">
							The host has not confirmed that every flow worker stopped.
						</p>
					)}
					<FlowRunTree
						label={`${doc.flow.name} steps`}
						rows={withActors}
						now={now}
						onDecide={(key) => setDecision(rows.find((row) => row.key === key)?.actionKey ?? null)}
						onOpenTerminal={(key) => setTerminal(taskOf(key))}
					/>
					{terminal && <FlowTaskTerminal task={terminal} onClose={() => setTerminal(null)} />}
					{decision !== null && (
						<FlowDecisionDialog execution={execution} actionKey={decision} onClose={() => setDecision(null)} />
					)}
				</>
			)}
			<ConfirmDialog
				open={confirmCancel}
				title="Cancel this run?"
				description="The host stops the active workers of this run and keeps their files and output."
				confirmLabel="Cancel run"
				danger
				processing={cancel.isPending}
				onCancel={() => !cancel.isPending && setConfirmCancel(false)}
				onConfirm={() => cancel.mutate()}
			/>
		</section>
	);
}
