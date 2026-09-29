import type { QueryClient, QueryKey } from "@tanstack/query-core";
import { dropTicketQueries } from "../dropTicketQueries.ts";
import { family, forQuery, forTicket, type Matcher, ticketDetail } from "../invalidationCoalescer.ts";
import type { SearchOutput } from "../schemas/search.ts";
import type { BoardOutput, ListOutput, Ticket, TicketSummary } from "../schemas/ticket.ts";
import type { SettleCheck } from "../settleCheck.ts";
import { holdsTicketRows, isCounts, isDetail, ticketRows } from "../ticketPatches.ts";
import type { Tombstones } from "../tombstones.ts";

type Dependencies = {
	enqueue: (matchers: Matcher[]) => void;
	hold: (summary: TicketSummary) => boolean;
	settle: SettleCheck;
	tombstones: Tombstones;
};

const patchQuery = (key: QueryKey, data: unknown, summaries: ReadonlyMap<string, TicketSummary>, deleted: boolean) => {
	let changed = false;
	const items = (rows: TicketSummary[], parentId?: string) =>
		rows.flatMap((row) => {
			const summary = summaries.get(row.id);
			if (summary === undefined || (!deleted && summary.version <= row.version)) return [row];
			changed = true;
			return deleted || (parentId !== undefined && summary.parent?.id !== parentId) ? [] : [summary];
		});
	const path = Array.isArray(key[0]) ? key[0].join(".") : "";
	let result: unknown;
	if (path === "tickets.list") {
		const list = data as ListOutput | { pages: ListOutput[]; pageParams: unknown[] };
		result =
			"pages" in list
				? { ...list, pages: list.pages.map((page) => ({ ...page, items: items(page.items) })) }
				: { ...list, items: items(list.items) };
	} else if (path === "tickets.board") {
		const board = data as BoardOutput;
		result = {
			...board,
			columns: board.columns.map((column) => {
				const next = items(column.items);
				return { ...column, items: next, count: column.count - (column.items.length - next.length) };
			}),
		};
	} else if (path === "search.query") {
		const search = data as SearchOutput;
		result = { ...search, tickets: items(search.tickets) };
	} else if (path === "tickets.get") {
		const detail = data as Ticket;
		const summary = summaries.get(detail.id);
		const children = items(detail.children, detail.id);
		if (summary !== undefined && summary.version > detail.version) {
			changed = true;
			result = { ...detail, ...summary, children };
		} else result = { ...detail, children };
	}
	return changed ? result : undefined;
};

// A bulk response contains one summary per ticket. Index the summaries once so each cached row needs one lookup.
export const createSummaryBatchApplier =
	(client: QueryClient, deps: Dependencies) =>
	(summaries: readonly TicketSummary[], deleted = false) => {
		const accepted = deleted
			? summaries
			: summaries.filter((summary) => !deps.tombstones.has(summary.id) && !deps.hold(summary));
		const byId = new Map(accepted.map((summary) => [summary.id, summary]));
		if (deleted) {
			deps.tombstones.addMany([...byId.keys()]);
			dropTicketQueries(client, accepted);
		}
		const matchers: Matcher[] = [family("needsYou")];
		for (const query of client.getQueryCache().getAll()) {
			const data = query.state.data;
			const fetching = query.state.fetchStatus !== "idle";
			const settles = fetching && (holdsTicketRows(query.queryKey) || (deleted && isCounts(query.queryKey)));
			if (settles) {
				const held = new Set(data === undefined ? [] : ticketRows(query.queryKey, data).map((row) => row.id));
				for (const summary of accepted)
					deps.settle.record(query, { summary, deleted, fields: [] }, data === undefined || held.has(summary.id));
			}
			if (data === undefined) continue;
			const patched = patchQuery(query.queryKey, data, byId, deleted);
			if (patched === undefined) continue;
			const invalidated = query.state.isInvalidated;
			client.setQueryData(query.queryKey, patched);
			if (!fetching && invalidated) matchers.push(forQuery(query));
			if (isDetail(query.queryKey) && (patched as Ticket).children.length < (data as Ticket).children.length) {
				matchers.push(...ticketDetail((data as Ticket).id));
			}
		}
		if (deleted) {
			matchers.push(
				family("tickets", "list"),
				family("tickets", "board"),
				family("tickets", "counts"),
				family("projects", "list"),
				family("tickets", "dependencies"),
			);
			for (const summary of accepted) {
				if (summary.parent !== null) matchers.push(...ticketDetail(summary.parent.id));
			}
			if (accepted.some((summary) => summary.epic !== null)) matchers.push(family("epics"));
		} else {
			for (const summary of accepted) matchers.push(forTicket(["timeline", "list"], summary.id));
		}
		deps.enqueue(matchers);
		return accepted;
	};
