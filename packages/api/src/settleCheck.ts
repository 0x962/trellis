import type { Query, QueryClient } from "@tanstack/query-core";
import { patchTicketQuery, type TicketChange, ticketRows } from "./ticketPatches.ts";

export type SettleCheck = {
	record: (query: Query, change: TicketChange) => void;
};

// A fetch in flight can read its rows before the commit of an event that
// arrives during the fetch. The result then holds a row older than the
// event, lacks a row the event created, or holds a row a delete removed.
// Under `staleTime: Infinity` that result stays. So the applier records,
// per query, every change applied while the query has a fetch in flight
// or no data yet. A create or an update is kept at its highest version.
// A delete outranks every other change for its id. When a fetch settles,
// every row of the result is compared with the record: the detail's own
// row and its children, or the rows of every page, column, or section.
// The query refetches when a recorded create or update names a row the
// result lacks, when a row is below its recorded version, or when the
// result holds a deleted row at any version. A deleted row leaves the
// result before the refetch, so no subscriber renders it. An active
// query refetches now. An inactive one is marked invalidated and
// refetches on its next mount. A settle clears the record, and so does
// the query's removal. A `setQueryData` write is a manual success, not a
// fetch's, so it settles nothing.
export const createSettleCheck = (queryClient: QueryClient): SettleCheck => {
	const records = new Map<string, Map<string, TicketChange>>();

	const settle = (query: Query, record: Map<string, TicketChange>) => {
		const versions = new Map(ticketRows(query.queryKey, query.state.data).map((row) => [row.id, row.version]));
		let data = query.state.data;
		let behind = false;
		for (const change of record.values()) {
			const version = versions.get(change.summary.id);
			if (change.deleted) {
				if (version === undefined) continue;
				behind = true;
				data = patchTicketQuery(query.queryKey, data, change);
			} else if (version === undefined || version < change.summary.version) {
				behind = true;
			}
		}
		if (!behind) return;
		if (data !== query.state.data) queryClient.setQueryData(query.queryKey, data);
		void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: "active" });
	};

	queryClient.getQueryCache().subscribe((event) => {
		if (event.type === "removed") {
			records.delete(event.query.queryHash);
			return;
		}
		if (event.type !== "updated" || event.action.type !== "success" || event.action.manual === true) return;
		const record = records.get(event.query.queryHash);
		if (record === undefined) return;
		records.delete(event.query.queryHash);
		settle(event.query, record);
	});

	const record = (query: Query, change: TicketChange) => {
		const changes = records.get(query.queryHash) ?? new Map<string, TicketChange>();
		records.set(query.queryHash, changes);
		const held = changes.get(change.summary.id);
		if (held !== undefined && (held.deleted || (!change.deleted && change.summary.version <= held.summary.version)))
			return;
		changes.set(change.summary.id, change);
	};

	return { record };
};
