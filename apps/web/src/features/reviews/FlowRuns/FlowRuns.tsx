import { Play } from "@phosphor-icons/react";
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { type FlowExecutionRecord, type FlowExecutionViewV1, flowRunIsLive } from "@trellis/api";
import { EmptyState, FailureState, IconButton, SectionHeader, Skeleton, Tooltip } from "@trellis/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { FlowRun } from "./components/FlowRun";
import { loadRunHistory } from "./components/loadRunHistory";
import { runIndexState } from "./components/runIndexState";
import { StartFlowDialog } from "./components/StartFlowDialog";
import { lastFocusedRun, runExpansionByDiff, runListOffsets } from "./runViewState";
import { useFlowRecovery } from "./useFlowRecovery";

type Execution = FlowExecutionRecord | FlowExecutionViewV1;
const live = (execution: Execution) =>
	flowRunIsLive("snapshot" in execution ? execution.status : execution.state.status);

const combineSnapshots = (queries: UseQueryResult<Execution>[]) => ({
	records: queries.flatMap((query) => (query.data ? [query.data] : [])),
	pending: queries.some((query) => query.isPending),
	error: queries.find((query) => query.error !== null)?.error,
	refreshing: queries.some((query) => query.isFetching),
});

type Props = {
	ticket: string;
	headSha: string;
	diffId: string;
	executionIds?: readonly string[];
	readOnly?: boolean;
	recoveryBlocked?: boolean;
};

export function FlowRuns({ ticket, headSha, diffId, executionIds, readOnly = false, recoveryBlocked = false }: Props) {
	const { orpc, client, queryClient } = useApp();
	const { blocked: recovery } = useFlowRecovery(recoveryBlocked);
	const hash = useLocation({ select: (location) => location.hash });
	const targetId = hash.startsWith("flow-run-") ? hash.slice("flow-run-".length) : null;
	const [start, setStart] = useState(false);
	const [expansion, setExpansion] = useState(() => ({
		diffId,
		runs: runExpansionByDiff.get(diffId) ?? new Map<string, boolean>(),
	}));
	const indexOptions = orpc.flowDocumentsV1.list.queryOptions({ input: { diffId } });
	const history = useQuery({
		...indexOptions,
		queryKey: [...indexOptions.queryKey, "complete-history"],
		enabled: executionIds === undefined,
		queryFn: ({ signal }) => loadRunHistory(client, diffId, signal),
	});
	const identities = useMemo(
		() => executionIds?.map((id) => ({ id, engine: "langflow" })) ?? history.data ?? [],
		[executionIds, history.data],
	);
	const indexesById = useMemo(() => new Map(identities.map((run, index) => [run.id, index])), [identities]);
	const getItemKey = useCallback((index: number) => identities[index]!.id, [identities]);
	const rangeExtractor = useCallback(
		(range: Parameters<typeof defaultRangeExtractor>[0]) => {
			const indexes = new Set(defaultRangeExtractor(range));
			for (const id of [targetId, lastFocusedRun.id]) {
				const index = id === null ? undefined : indexesById.get(id);
				if (index !== undefined) indexes.add(index);
			}
			return [...indexes].sort((a, b) => a - b);
		},
		[indexesById, targetId],
	);
	const viewport = useRef<HTMLDivElement>(null);
	const list = useVirtualizer({
		count: identities.length,
		getScrollElement: () => viewport.current,
		estimateSize: () => 120,
		getItemKey,
		overscan: 3,
		initialOffset: () => runListOffsets.get(diffId) ?? 0,
		rangeExtractor,
	});
	const visible = list.getVirtualItems();
	const snapshots = useQueries({
		combine: combineSnapshots,
		queries: visible.map((item) => {
			const { id } = identities[item.index]!;
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
	const records = snapshots.records;
	const recordsById = new Map(records.map((record) => [record.id, record]));
	const pending = (executionIds === undefined && history.isPending) || snapshots.pending;
	const error = (executionIds === undefined ? history.error : null) ?? snapshots.error;
	const targetScroll = useRef(() => {});
	targetScroll.current = () =>
		list.scrollToIndex(
			identities.findIndex((run) => run.id === targetId),
			{ align: "auto" },
		);
	const hasTarget = identities.some((execution) => execution.id === targetId);
	useEffect(() => {
		if (targetId === null || !hasTarget) return;
		const runs = new Map(runExpansionByDiff.get(diffId)).set(targetId, true);
		runExpansionByDiff.set(diffId, runs);
		setExpansion({ diffId, runs });
		targetScroll.current();
	}, [targetId, hasTarget, diffId]);
	if (expansion.diffId !== diffId) setExpansion({ diffId, runs: runExpansionByDiff.get(diffId) ?? new Map() });
	else if (records.some((execution) => !expansion.runs.has(execution.id))) {
		const runs = new Map(expansion.runs);
		for (const execution of records) {
			if (!runs.has(execution.id)) runs.set(execution.id, live(execution) || indexesById.get(execution.id) === 0);
		}
		runExpansionByDiff.set(diffId, runs);
		setExpansion({ diffId, runs });
	}
	const toggle = (id: string) => {
		const runs = new Map(expansion.runs).set(id, !expansion.runs.get(id));
		runExpansionByDiff.set(diffId, runs);
		setExpansion({ diffId, runs });
	};
	const { pendingFlowIds, activeFlowIds } = useMemo(() => runIndexState(history.data ?? []), [history.data]);
	const refreshing = (executionIds === undefined && history.isFetching) || snapshots.refreshing;
	const blocked = recovery || pending || refreshing || Boolean(error);
	return (
		<section aria-label="Flows" className="flex flex-col gap-4">
			<SectionHeader
				title="Flows"
				count={executionIds?.length ?? history.data?.length}
				actions={
					!readOnly && executionIds === undefined ? (
						<Tooltip content="Start a flow">
							<IconButton label="Start a flow" icon={<Play />} onClick={() => setStart(true)} disabled={blocked} />
						</Tooltip>
					) : undefined
				}
			/>
			{error && <FailureState variant="section" title="Could not refresh flow runs" detail={error.message} />}
			{executionIds === undefined && history.isPending && (
				<div role="status" aria-label="Load flow runs">
					<span className="sr-only">Load flow runs</span>
					<Skeleton lines={3} height="h-9" />
				</div>
			)}
			{!pending && !error && identities.length === 0 && (
				<EmptyState title="No flow runs" description="This diff has no recorded flow run." />
			)}
			<div
				ref={viewport}
				className="max-h-240 overflow-auto"
				onScroll={(event) => runListOffsets.set(diffId, event.currentTarget.scrollTop)}
			>
				<div className="relative" style={{ height: list.getTotalSize() }}>
					{visible.map((item) => {
						const identity = identities[item.index]!;
						const execution = recordsById.get(identity.id);
						return (
							<div
								key={identity.id}
								ref={list.measureElement}
								data-index={item.index}
								className="absolute inset-x-0 top-0 pb-6"
								style={{ transform: `translateY(${item.start}px)` }}
							>
								{execution ? (
									<FlowRun
										key={execution.id}
										execution={execution}
										ticket={ticket}
										diffId={diffId}
										expanded={expansion.runs.get(execution.id) ?? false}
										onToggle={() => toggle(execution.id)}
										canStart={executionIds === undefined && !activeFlowIds.has(execution.flowId)}
										pendingFlowIds={pendingFlowIds}
										headSha={headSha}
										readOnly={readOnly}
										recoveryBlocked={blocked}
									/>
								) : (
									<Skeleton lines={3} height="h-9" />
								)}
							</div>
						);
					})}
				</div>
			</div>
			{start && (
				<StartFlowDialog
					ticket={ticket}
					diffId={diffId}
					headSha={headSha}
					pendingFlowIds={pendingFlowIds}
					recoveryBlocked={blocked}
					onClose={() => setStart(false)}
				/>
			)}
		</section>
	);
}
