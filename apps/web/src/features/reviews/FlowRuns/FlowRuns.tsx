import { Play } from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { type FlowExecutionRecord, type FlowExecutionViewV1, flowRunIsLive } from "@trellis/api";
import { EmptyState, FailureState, IconButton, SectionHeader, Skeleton, Tooltip } from "@trellis/ui";
import { type ComponentProps, useEffect, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { FlowRun } from "./components/FlowRun";
import { loadRunHistory } from "./components/FlowRun/buildFlowRunRows/loadRunHistory";
import { runExpansionByDiff } from "./components/FlowRun/buildFlowRunRows/runViewState";
import { StartFlowDialog } from "./components/StartFlowDialog";

type Execution = FlowExecutionRecord | FlowExecutionViewV1;
const live = (execution: Execution) =>
	flowRunIsLive("snapshot" in execution ? execution.status : execution.state.status);

type Props = {
	ticket: string;
	headSha: string;
	diffId: string;
	executionIds?: readonly string[];
	readOnly?: boolean;
	recoveryBlocked?: boolean;
	onDecideV1?: ComponentProps<typeof FlowRun>["onDecideV1"];
	onCancelV1?: ComponentProps<typeof FlowRun>["onCancelV1"];
	readRetainedOutput?: ComponentProps<typeof FlowRun>["readRetainedOutput"];
};

export function FlowRuns({
	ticket,
	headSha,
	diffId,
	executionIds,
	readOnly = false,
	recoveryBlocked = false,
	onDecideV1,
	onCancelV1,
	readRetainedOutput,
}: Props) {
	const { orpc, client, queryClient } = useApp();
	const hash = useLocation({ select: (location) => location.hash });
	const targetId = hash.startsWith("flow-run-") ? hash.slice("flow-run-".length) : null;
	const [start, setStart] = useState(false);
	const [expansion, setExpansion] = useState(() => ({
		diffId,
		runs: runExpansionByDiff.get(diffId) ?? new Map<string, boolean>(),
	}));
	const legacyOptions = orpc.flowExecutions.list.queryOptions({ input: { diffId } });
	const legacy = useQuery({
		...legacyOptions,
		queryKey: [...legacyOptions.queryKey, "complete-history"],
		enabled: executionIds === undefined,
		queryFn: ({ signal }) => loadRunHistory(client, diffId, signal),
	});
	const snapshots = useQueries({
		queries: (executionIds ?? []).map((id) => {
			const options = orpc.flowDocumentsV1.view.queryOptions({ input: { id } });
			return {
				...options,
				queryFn: async ({ signal }: { signal: AbortSignal }) => {
					const snapshot = await client.flowDocumentsV1.view({ id }, { signal });
					const previous = queryClient.getQueryData<FlowExecutionViewV1>(options.queryKey);
					return previous && (snapshot.revision < previous.revision || snapshot.lastEventSeq < previous.lastEventSeq)
						? previous
						: snapshot;
				},
			};
		}),
	});
	const records: Execution[] =
		executionIds === undefined ? (legacy.data ?? []) : snapshots.flatMap((query) => (query.data ? [query.data] : []));
	const pending = executionIds === undefined ? legacy.isPending : snapshots.some((query) => query.isPending);
	const error = executionIds === undefined ? legacy.error : snapshots.find((query) => query.error !== null)?.error;
	const hasTarget = records.some((execution) => execution.id === targetId);
	useEffect(() => {
		if (targetId === null || !hasTarget) return;
		const runs = new Map(runExpansionByDiff.get(diffId)).set(targetId, true);
		runExpansionByDiff.set(diffId, runs);
		setExpansion({ diffId, runs });
		document.getElementById(`flow-run-${targetId}`)?.scrollIntoView({ block: "nearest" });
	}, [targetId, hasTarget, diffId]);
	if (expansion.diffId !== diffId) setExpansion({ diffId, runs: runExpansionByDiff.get(diffId) ?? new Map() });
	else if (records.some((execution) => !expansion.runs.has(execution.id))) {
		const runs = new Map(expansion.runs);
		for (const [index, execution] of records.entries()) {
			if (!runs.has(execution.id)) runs.set(execution.id, live(execution) || index === 0);
		}
		runExpansionByDiff.set(diffId, runs);
		setExpansion({ diffId, runs });
	}
	const toggle = (id: string) => {
		const runs = new Map(expansion.runs).set(id, !expansion.runs.get(id));
		runExpansionByDiff.set(diffId, runs);
		setExpansion({ diffId, runs });
	};
	const anyLive = records.some(live);
	const refreshing = executionIds === undefined ? legacy.isFetching : snapshots.some((query) => query.isFetching);
	const blocked = recoveryBlocked || pending || refreshing || Boolean(error);
	return (
		<section aria-label="Flows" className="flex flex-col gap-4">
			<SectionHeader
				title="Flows"
				count={executionIds?.length ?? legacy.data?.length}
				actions={
					!readOnly && executionIds === undefined ? (
						<Tooltip content="Start a flow">
							<IconButton label="Start a flow" icon={<Play />} onClick={() => setStart(true)} disabled={blocked} />
						</Tooltip>
					) : undefined
				}
			/>
			{error && <FailureState variant="section" title="Could not refresh flow runs" detail={error.message} />}
			{pending && (
				<div role="status" aria-label="Load flow runs">
					<span className="sr-only">Load flow runs</span>
					<Skeleton lines={3} height="h-9" />
				</div>
			)}
			{!pending && !error && records.length === 0 && (
				<EmptyState title="No flow runs" description="This diff has no recorded flow run." />
			)}
			<div className="flex flex-col gap-6">
				{records.map((execution) => (
					<FlowRun
						key={execution.id}
						execution={execution}
						ticket={ticket}
						diffId={diffId}
						expanded={expansion.runs.get(execution.id) ?? false}
						onToggle={() => toggle(execution.id)}
						canStart={!anyLive}
						headSha={headSha}
						readOnly={readOnly}
						recoveryBlocked={blocked}
						onDecideV1={onDecideV1}
						onCancelV1={onCancelV1}
						readRetainedOutput={readRetainedOutput}
					/>
				))}
			</div>
			{start && (
				<StartFlowDialog
					ticket={ticket}
					diffId={diffId}
					headSha={headSha}
					recoveryBlocked={blocked}
					onClose={() => setStart(false)}
				/>
			)}
		</section>
	);
}
