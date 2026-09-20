import type { Ticket, TicketSummary } from "@trellis/api";

// The summary fields of a full ticket: what a list row or a child row holds.
export const summaryOf = (ticket: Ticket): TicketSummary => {
	const { description, contract, outcome, children, prs, attachments, descriptionStale, ...summary } = ticket;
	return summary;
};
