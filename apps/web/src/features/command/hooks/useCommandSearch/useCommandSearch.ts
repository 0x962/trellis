import { useQuery } from "@tanstack/react-query";
import { TicketRefStringSchema, type TicketSummary } from "@trellis/api";
import { useEffect, useState } from "react";
import { useApp } from "../../../../lib/appContext";

export type CommandSearch = {
	// The top 6 tickets for the query.
	tickets: TicketSummary[];
	// The identifier the query spells, or null. The match is local, so the
	// jump item needs no request.
	jump: string | null;
};

// The debounce before a typed query reaches search.query.
export const searchDebounceMs = 120;

// How many tickets the palette shows. The full list lives on /search.
const topResults = 6;

const empty: TicketSummary[] = [];

// `cde-1` and `CDE-1` both name CDE-1, because the ref grammar reads
// either case.
const jumpOf = (query: string): string | null => {
	const parsed = TicketRefStringSchema.safeParse(query.trim());
	return parsed.success ? parsed.data : null;
};

// Runs search.query for `query` after the debounce. An empty query runs
// nothing.
export const useCommandSearch = (query: string): CommandSearch => {
	const { orpc, scheduler } = useApp();
	const [debounced, setDebounced] = useState("");
	const trimmed = query.trim();

	useEffect(() => {
		if (trimmed === "") {
			setDebounced("");
			return;
		}
		const handle = scheduler.setTimeout(() => setDebounced(trimmed), searchDebounceMs);
		return () => scheduler.clearTimeout(handle);
	}, [trimmed, scheduler]);

	const jump = jumpOf(query);
	const enabled = debounced !== "";
	const results = useQuery({
		...orpc.search.query.queryOptions({ input: { q: debounced, limit: topResults } }),
		enabled,
	});

	// The rendered results always belong to the query on screen, so a slow
	// response for an earlier query never lands.
	if (!enabled || results.data === undefined) return { tickets: empty, jump };
	return { tickets: results.data.tickets.filter((ticket) => ticket.identifier !== jump), jump };
};
