import type { Query, QueryClient } from "@tanstack/query-core";
import type { TicketSummary } from "./schemas/ticket.ts";
import { isDetail } from "./ticketPatches.ts";

// The input fields that hold a ticket ref: one ref in `ticket` or `id`,
// and a batch of refs in `tickets`. Every other input field is a filter
// or free text. A `q` that spells the identifier is a search term, and
// a `parent` filter names the rows' parent, not the rows.
const refsIn = (input: Record<string, unknown>) => {
	const tickets = Array.isArray(input.tickets) ? input.tickets : [];
	return [input.ticket, input.id, ...tickets].filter((value) => typeof value === "string");
};

// Cancels and removes every query that names the ticket. That is a detail
// whose data carries the id, and any query whose input holds the ULID or
// the identifier in a ref field. The cancel comes first, so a fetch in
// flight is dropped before its result can reach the cache. An input ref
// keeps the spelling the caller used, so the compare is upper-case.
export const dropTicketQueries = (queryClient: QueryClient, summary: TicketSummary) => {
	const refs = new Set([summary.id, summary.identifier.toUpperCase()]);
	const namesTicket = (query: Query) => {
		const input = (query.queryKey[1] as { input?: Record<string, unknown> } | undefined)?.input;
		const inInput = input !== undefined && refsIn(input).some((value) => refs.has(value.toUpperCase()));
		return (
			inInput || (isDetail(query.queryKey) && (query.state.data as { id?: unknown } | undefined)?.id === summary.id)
		);
	};
	const targets = new Set(queryClient.getQueryCache().getAll().filter(namesTicket));
	if (targets.size === 0) return;
	const predicate = (query: Query) => targets.has(query);
	void queryClient.cancelQueries({ predicate });
	queryClient.removeQueries({ predicate });
};
