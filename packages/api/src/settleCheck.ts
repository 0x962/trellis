import type { Query, QueryClient } from "@tanstack/query-core";
import { ticketRows } from "./ticketPatches.ts";

export type SettleCheck = {
	record: (query: Query, ticketId: string, version: number) => void;
};

// A fetch in flight can read a row before the commit of an event that
// arrives during the fetch. The result then replaces the patched row with
// an older one, and under `staleTime: Infinity` that row stays. So the
// applier records, per query, the highest version it patched for each
// ticket. It records while the query has a fetch in flight or no data yet.
// When a fetch settles, the query's rows are checked against that record.
// A row below its recorded version makes the query refetch. An active
// query refetches now. An inactive one is marked invalidated and refetches
// on its next mount. A settle clears the record, and so does the query's
// removal. A `setQueryData` write is a manual success, not a fetch's, so
// it settles nothing.
export const createSettleCheck = (queryClient: QueryClient): SettleCheck => {
	const records = new Map<string, Map<string, number>>();

	queryClient.getQueryCache().subscribe((event) => {
		if (event.type === "removed") {
			records.delete(event.query.queryHash);
			return;
		}
		if (event.type !== "updated" || event.action.type !== "success" || event.action.manual === true) return;
		const record = records.get(event.query.queryHash);
		if (record === undefined) return;
		records.delete(event.query.queryHash);
		const stale = ticketRows(event.query.queryKey, event.query.state.data).some((row) => {
			const recorded = record.get(row.id);
			return recorded !== undefined && row.version < recorded;
		});
		if (!stale) return;
		void queryClient.invalidateQueries({ queryKey: event.query.queryKey, exact: true, refetchType: "active" });
	});

	const record = (query: Query, ticketId: string, version: number) => {
		const versions = records.get(query.queryHash) ?? new Map<string, number>();
		records.set(query.queryHash, versions);
		versions.set(ticketId, Math.max(versions.get(ticketId) ?? 0, version));
	};

	return { record };
};
