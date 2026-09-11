import type { ActorRef, TicketSummary } from "@trellis/api";
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

// A comment frame the way the server sends it: the ticket, the author, and
// the text travel with the event, so a reader needs no second call.
export const commentEvent = (
	type: "comment.created" | "comment.updated" | "comment.deleted",
	ticket: { id: string; identifier: string; title: string },
	comment: { id: string; body: string; actor: ActorRef },
) => ({
	type,
	id: comment.id,
	ticketId: ticket.id,
	ticketIdentifier: ticket.identifier,
	ticketTitle: ticket.title,
	actor: comment.actor,
	body: comment.body,
	bodyTruncated: false,
});
