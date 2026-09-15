import type { Ticket, TicketSummary, TrellisClient } from "@trellis/api";
import { approveTarget } from "../../../../ticket/reviewTargets";

// Moves the ticket to the status after its own in column order. The
// summary's version travels as `expectedVersion`, so a stale row is
// VERSION_CONFLICT.
export const approve = async (client: TrellisClient, summary: TicketSummary): Promise<Ticket> => {
	const { statuses } = await client.statuses.list({ project: summary.project.id });
	const target = approveTarget(statuses, summary.status);
	return client.tickets.move({ ticket: summary.id, status: target.id, expectedVersion: summary.version });
};

// How far one send back got. `posted` turns true once the comment is on the
// server, so a second run with the same object moves the ticket only and
// never posts the comment twice.
export type SendBackProgress = { posted: boolean };

// Posts the comment, then moves the ticket to the lowest-position started
// status. A failed comment stops the move. The comment bumps the ticket's
// version on the server, so the move carries no expected version.
export const sendBack = async (
	client: TrellisClient,
	summary: TicketSummary,
	comment: string,
	progress: SendBackProgress = { posted: false },
): Promise<Ticket> => {
	if (!progress.posted) {
		await client.comments.create({ ticket: summary.id, body: comment });
		progress.posted = true;
	}
	return client.tickets.move({ ticket: summary.id, status: "category:started" });
};
