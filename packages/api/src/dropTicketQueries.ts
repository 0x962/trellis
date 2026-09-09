import type { Query, QueryClient } from "@tanstack/query-core";
import type { TicketSummary } from "./schemas/ticket.ts";
import { isDetail } from "./ticketPatches.ts";

// Cancels and removes every query that names the ticket. That is a detail
// whose data carries the id, and any query whose input holds the ULID or
// the identifier. The cancel comes first, so a fetch in flight is dropped
// before its result can reach the cache. An input ref keeps the spelling
// the caller used, so the compare is upper-case.
export const dropTicketQueries = (queryClient: QueryClient, summary: TicketSummary) => {
	const refs = new Set([summary.id, summary.identifier.toUpperCase()]);
	const namesTicket = (query: Query) => {
		const input = (query.queryKey[1] as { input?: Record<string, unknown> } | undefined)?.input;
		const inInput =
			input !== undefined &&
			Object.values(input).some((value) => typeof value === "string" && refs.has(value.toUpperCase()));
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
