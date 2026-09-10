import type { TicketSummary } from "@trellis/api";
import { batchId } from "./fixtures";

// A `ticket.updated` frame for `summary` with the changed `fields`.
export const updatedEvent = (summary: TicketSummary, fields: string[]) => ({
	type: "ticket.updated" as const,
	summary,
	fields,
	batchId,
});

export const deletedEvent = (summary: TicketSummary) => ({
	type: "ticket.deleted" as const,
	summary,
	fields: [],
	batchId,
});

// The summary fields of a full ticket: what an event carries.
export const summaryOf = (ticket: Record<string, unknown>): TicketSummary => {
	const { description, children, prs, attachments, descriptionStale, ...summary } = ticket;
	return summary as TicketSummary;
};
