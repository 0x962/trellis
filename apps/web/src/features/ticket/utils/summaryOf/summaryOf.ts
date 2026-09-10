import type { Ticket, TicketSummary } from "@trellis/api";

// The summary fields of a full ticket: what a list row or a child row holds.
export const summaryOf = (ticket: Ticket): TicketSummary => {
	const { description, children, prs, attachments, descriptionStale, ...summary } = ticket;
	return summary;
};
