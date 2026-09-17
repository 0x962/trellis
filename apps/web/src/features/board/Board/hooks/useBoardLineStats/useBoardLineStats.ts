import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { BoardLineStats } from "../../../BoardLineStatsContext";

const batchSize = 200;

export function useBoardLineStats(ticketIds: string[]): BoardLineStats {
	const { orpc } = useApp();
	const batches = useMemo(() => {
		const result: string[][] = [];
		for (let index = 0; index < ticketIds.length; index += batchSize) {
			result.push(ticketIds.slice(index, index + batchSize));
		}
		return result;
	}, [ticketIds]);
	const queries = useQueries({
		queries: batches.map((batch) => ({
			...orpc.agentRuns.workspaceLineStats.queryOptions({ input: { ticketIds: batch } }),
			refetchInterval: 15000,
		})),
	});
	const values = new Map<string, { additions: number; deletions: number }>();
	const pendingIds = new Set<string>();
	for (const [index, query] of queries.entries()) {
		for (const value of query.data ?? []) values.set(value.ticketId, value);
		if (query.isPending) for (const ticketId of batches[index]!) pendingIds.add(ticketId);
	}
	return { values, pendingIds };
}
