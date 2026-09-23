import { readyForReview } from "../reviewReady/reviewReady.ts";
import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";

export type Turn = "you" | "agent" | "github" | "ready" | "waits on a merge" | "done";

export type TurnRow = TicketSummary | TicketPr;

const isTicket = (row: TurnRow): row is TicketSummary => "prRows" in row;

// Nobody can do anything about a check that still runs, so a pull request
// that needs only that waits for GitHub. Every other missing part waits for
// the agent that wrote the pull request.
const waitsForGithub = (pullRequest: TicketPr): boolean =>
	pullRequest.state === "open" &&
	pullRequest.reviewGaps.length > 0 &&
	pullRequest.reviewGaps.every((gap) => gap.kind === "checks-pending");

const waitsForAgent = (pullRequest: TicketPr): boolean =>
	pullRequest.state === "open" && !readyForReview(pullRequest) && !waitsForGithub(pullRequest);

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
	if (hasWorkingRun || pullRequests.some((pullRequest) => waitsForAgent(pullRequest))) return "agent";
	if (pullRequests.some((pullRequest) => waitsForGithub(pullRequest))) return "github";
	if (pullRequests.some((pullRequest) => pullRequest.state === "open" && readyForReview(pullRequest))) return "you";
	if (ticket?.status.category === "todo" && ticket.ready) return "ready";
	if (ticket?.status.category === "todo") return "waits on a merge";
	if (ticket === null) return "done";
	return "agent";
}
