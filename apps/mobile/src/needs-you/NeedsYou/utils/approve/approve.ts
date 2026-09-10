import type { Ticket, TicketSummary, TrellisClient } from "@trellis/api";

// Moves the ticket to the lowest-position done status. The summary's
// version travels as `expectedVersion`, so a stale row is VERSION_CONFLICT.
export const approve = (client: TrellisClient, summary: TicketSummary): Promise<Ticket> =>
	client.tickets.move({ ticket: summary.id, status: "category:done", expectedVersion: summary.version });

// Posts the comment, then moves the ticket to the lowest-position started
// status. A failed comment stops the move. The comment bumps the ticket's
// version on the server, so the move carries no expected version.
export const sendBack = async (client: TrellisClient, summary: TicketSummary, comment: string): Promise<Ticket> => {
	await client.comments.create({ ticket: summary.id, body: comment });
	return client.tickets.move({ ticket: summary.id, status: "category:started" });
};
