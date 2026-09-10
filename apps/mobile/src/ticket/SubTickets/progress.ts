import type { TicketSummary } from "@trellis/api";

// The numbers behind the sub-ticket bar. `share` is `done / total`, 0 to 1.
export type SubTicketProgress = {
	done: number;
	total: number;
	share: number;
};

// Null for a ticket without children, so the screen hides the section.
export const subTicketProgress = (_children: readonly TicketSummary[]): SubTicketProgress | null => {
	throw new Error("subTicketProgress is not implemented");
};
