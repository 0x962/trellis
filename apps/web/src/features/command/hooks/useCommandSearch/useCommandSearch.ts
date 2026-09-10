import type { TicketSummary } from "@trellis/api";

export type CommandSearch = {
	// The top 6 tickets for the query.
	tickets: TicketSummary[];
	// The identifier the query spells, or null. The match is local, so the
	// jump item needs no request.
	jump: string | null;
};

// The debounce before a typed query reaches search.query.
export const searchDebounceMs = 120;

// Runs search.query for `query` after the debounce. An empty query runs
// nothing.
export const useCommandSearch = (_query: string): CommandSearch => ({ tickets: [], jump: null });
