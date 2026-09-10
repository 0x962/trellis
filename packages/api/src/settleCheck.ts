import type { Query, QueryClient } from "@tanstack/query-core";
import { holdsTicketRows, patchTicketQuery, type TicketChange, ticketRows } from "./ticketPatches.ts";

export type SettleCheck = {
	record: (query: Query, change: TicketChange, expected: boolean) => void;
};

// One recorded change. `expected` is true when the query had no data, or
// held the row when the change arrived. A result that lacks an expected
// row is behind. A result that lacks a row the cache also lacked is not.
type Held = { change: TicketChange; expected: boolean };

// A fetch in flight can read its rows before the commit of an event that
// arrives during the fetch. The result then holds a row older than the
// event, lacks a row the event created, or holds a row a delete removed.
// Under `staleTime: Infinity` that result stays. So the applier records,
// per query, every change applied while the query has a fetch in flight
// or no data yet. A create or an update is kept at its highest version.
// A delete outranks every other change for its id. When a fetch settles,
// the check reads every row of the result. That is the detail's own row
// and its children, or the rows of every page, column, or section. One
// row below its recorded version marks the query behind. So one id at
// two versions across two pages refetches. A recorded expected row that
// the result lacks marks the query behind. A deleted row in the result
// marks the query behind at any version. A query whose result holds no
// ticket rows, such as counts, is behind when any change is recorded. A
// deleted row leaves the result before the refetch, so no subscriber
// renders it. An active query refetches now. An inactive one is marked
// invalidated and refetches on its next mount. A settle clears the
// record, and so does the query's removal. A `setQueryData` write is a
// manual success, not a fetch's, so it settles nothing.
export const createSettleCheck = (queryClient: QueryClient): SettleCheck => {
	const records = new Map<string, Map<string, Held>>();

	const settle = (query: Query, record: Map<string, Held>) => {
		let data = query.state.data;
		let behind = !holdsTicketRows(query.queryKey);
		const found = new Set<string>();
		for (const row of ticketRows(query.queryKey, data)) {
			const held = record.get(row.id);
			if (held === undefined) continue;
			if (held.change.deleted) {
				if (!found.has(row.id)) data = patchTicketQuery(query.queryKey, data, held.change);
				behind = true;
			} else if (row.version < held.change.summary.version) {
				behind = true;
			}
			found.add(row.id);
		}
		for (const [id, held] of record) {
			if (held.expected && !held.change.deleted && !found.has(id)) behind = true;
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

	const record = (query: Query, change: TicketChange, expected: boolean) => {
		const changes = records.get(query.queryHash) ?? new Map<string, Held>();
		records.set(query.queryHash, changes);
		const held = changes.get(change.summary.id);
		if (
			held !== undefined &&
			(held.change.deleted || (!change.deleted && change.summary.version <= held.change.summary.version))
		)
			return;
		changes.set(change.summary.id, { change, expected });
	};

	return { record };
};
