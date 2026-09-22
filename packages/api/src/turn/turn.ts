import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";

export type Turn = "you" | "agent" | "github" | "ready" | "waits on a merge" | "done";

export type TurnRow = TicketSummary | TicketPr;

const isTicket = (row: TurnRow): row is TicketSummary => "prRows" in row;

export function turnOf(row: TurnRow, hasWorkingRun: boolean): Turn {
	let ticket: TicketSummary | null;
	let pullRequests: TicketPr[];
	if (isTicket(row)) {
		ticket = row;
		pullRequests = row.prRows;
	} else {
		ticket = null;
		pullRequests = [row];
	}

	if (ticket?.status.category === "done" || ticket?.status.category === "canceled") return "done";
	if (ticket?.status.reviewer === "human") return "you";
	if (
		hasWorkingRun ||
		pullRequests.some(
			(pullRequest) =>
				pullRequest.state === "open" && (pullRequest.isDraft || pullRequest.fail > 0 || pullRequest.openThreads > 0),
		)
	)
		return "agent";
	if (
		pullRequests.some(
			(pullRequest) =>
				pullRequest.state === "open" && !pullRequest.isDraft && pullRequest.fail === 0 && pullRequest.pending > 0,
		)
	)
		return "github";
	if (
		pullRequests.some(
			(pullRequest) =>
				pullRequest.state === "open" && !pullRequest.isDraft && pullRequest.fail === 0 && pullRequest.openThreads === 0,
		)
	)
		return "you";
	if (ticket?.status.category === "todo" && ticket.ready) return "ready";
	if (ticket?.status.category === "todo") return "waits on a merge";
	if (ticket === null) return "done";
	return "agent";
}
