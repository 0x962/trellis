import type { Query, QueryClient } from "@tanstack/react-query";
import type { ListOutput, ListQueryInput, TicketSummary } from "@trellis/api";

type Pages = { pages: ListOutput[]; pageParams: unknown[] };

// The cached shapes of a `tickets.list` query: one page, or the pages of
// an infinite query.
type ListData = ListOutput | Pages;

const isList = (query: Query) => {
	const path = query.queryKey[0];
	return Array.isArray(path) && path.join(".") === "tickets.list";
};

const inputOf = (query: Query) => (query.queryKey[1] as { input?: ListQueryInput } | undefined)?.input ?? {};

const listQueries = (queryClient: QueryClient) =>
	queryClient
		.getQueryCache()
		.getAll()
		.filter((query) => isList(query) && query.state.data !== undefined);

const isPages = (data: ListData): data is Pages => "pages" in data;

export const rowsOf = (data: ListData): TicketSummary[] =>
	isPages(data) ? data.pages.flatMap((page) => page.items) : data.items;

const mapItems = (data: ListData, map: (items: TicketSummary[]) => TicketSummary[]): ListData =>
	isPages(data)
		? { ...data, pages: data.pages.map((page) => ({ ...page, items: map(page.items) })) }
		: { ...data, items: map(data.items) };

// The cached row of a ticket, from the first list that holds it.
export const readRow = (queryClient: QueryClient, id: string): TicketSummary | undefined => {
	for (const query of listQueries(queryClient)) {
		const row = rowsOf(query.state.data as ListData).find((entry) => entry.id === id);
		if (row !== undefined) return row;
	}
	return undefined;
};

// Rewrites the rows of `ids` in every cached list. An optimistic write
// keeps the row's version, so the server's own row, one version up,
// replaces it on arrival.
export const patchRows = (
	queryClient: QueryClient,
	ids: ReadonlySet<string>,
	patch: (row: TicketSummary) => TicketSummary,
) => {
	for (const query of listQueries(queryClient)) {
		const data = query.state.data as ListData;
		if (!rowsOf(data).some((row) => ids.has(row.id))) continue;
		queryClient.setQueryData(
			query.queryKey,
			mapItems(data, (items) => items.map((row) => (ids.has(row.id) ? patch(row) : row))),
		);
	}
};

// True when the query's filters accept the row. A filter the client cannot
// evaluate, such as a search or a time bound, rejects it: the refetch
// that follows a create settles those.
const accepts = (input: ListQueryInput, row: TicketSummary) => {
	if (input.q !== undefined || input.updated !== undefined || input.created !== undefined) return false;
	if (input.completed !== undefined || input.pr !== undefined || input.ci !== undefined) return false;
	if (input.actor !== undefined || input.waitsOn !== undefined || input.blocked !== undefined) return false;
	if (input.project !== undefined && row.project.key !== input.project) return false;
	const { status } = row;
	if (input.status !== undefined) {
		const refs = (Array.isArray(input.status) ? input.status : input.status.split(",")).map((ref) => ref.toLowerCase());
		if (
			!refs.some((ref) => ref === status.slug || ref === status.id.toLowerCase() || ref === status.name.toLowerCase())
		) {
			return false;
		}
	}
	if (input.category !== undefined && !input.category.includes(status.category)) return false;
	if (input.priority !== undefined && !input.priority.includes(row.priority)) return false;
	if (input.parent === "none" && row.parent !== null) return false;
	if (input.parent !== undefined && input.parent !== "none" && row.parent?.identifier !== input.parent.toUpperCase()) {
		return false;
	}
	return true;
};

// Insert each missing row once. The ID set avoids a list scan for each response item.
export const insertRows = (queryClient: QueryClient, rows: readonly TicketSummary[]) => {
	for (const query of listQueries(queryClient)) {
		const data = query.state.data as ListData;
		const ids = new Set(rowsOf(data).map((row) => row.id));
		const input = inputOf(query);
		const added = rows.filter((row) => !ids.has(row.id) && accepts(input, row)).toReversed();
		if (added.length === 0) continue;
		let placed = false;
		queryClient.setQueryData(
			query.queryKey,
			mapItems(data, (items) => {
				if (placed) return items;
				placed = true;
				return [...added, ...items];
			}),
		);
	}
};

export const insertRow = (queryClient: QueryClient, row: TicketSummary) => insertRows(queryClient, [row]);

// Capture each row once before an optimistic batch so rollback retains its original value.
export const readRows = (queryClient: QueryClient) => {
	const found = new Map<string, TicketSummary>();
	for (const query of listQueries(queryClient)) {
		for (const row of rowsOf(query.state.data as ListData)) if (!found.has(row.id)) found.set(row.id, row);
	}
	return found;
};
