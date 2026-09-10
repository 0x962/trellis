import type { Ticket, TicketSummary, TrellisClient } from "@trellis/api";

// Moves the ticket to the lowest-position done status. The summary's
// version travels as `expectedVersion`, so a stale row is VERSION_CONFLICT.
export const approve = (_client: TrellisClient, _summary: TicketSummary): Promise<Ticket> => {
	throw new Error("mobile-inbox: approve is not implemented");
};

// Posts the comment, then moves the ticket to the lowest-position started
// status. A failed comment stops the move.
export const sendBack = (_client: TrellisClient, _summary: TicketSummary, _comment: string): Promise<Ticket> => {
	throw new Error("mobile-inbox: sendBack is not implemented");
};
