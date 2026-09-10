import type { TicketSummary } from "@trellis/api";
import type { ReactElement } from "react";

export type SubTicketsProps = {
	// The children of the ticket. The section renders nothing for an empty list.
	tickets: readonly TicketSummary[];
};

// The sub-ticket rows with the progress bar. A row opens its ticket through
// `router.push` from expo-router.
export function SubTickets(_props: SubTicketsProps): ReactElement | null {
	throw new Error("SubTickets is not implemented");
}
