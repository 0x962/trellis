import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";

export type Turn = "you" | "agent" | "github" | "waits on your answer" | "waits on a merge" | "done";

export type TurnRow = TicketSummary | TicketPr;

const isTicket = (row: TurnRow): row is TicketSummary => "prRows" in row;

export function turnOf(row: TurnRow, workingRun: boolean): Turn {
	let ticket: TicketSummary | null;
	let pullRequests: TicketPr[];
	let closedPullRequest = false;
	if (isTicket(row)) {
		ticket = row;
		pullRequests = row.prRows;
	} else {
		ticket = null;
		pullRequests = [row];
		closedPullRequest = row.state !== "open";
	}

	if (ticket?.status.category === "done" || ticket?.status.category === "canceled") return "done";
	if (ticket?.status.reviewer === "human") return "you";
	if (
		workingRun ||
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
	if (ticket?.status.category === "todo") {
		return ticket.waitsOn.some((dependency) => dependency.isQuestion) ? "waits on your answer" : "waits on a merge";
	}
	if (closedPullRequest) return "done";
	return "agent";
}
