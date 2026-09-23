import { readyForReview } from "../reviewReady/reviewReady.ts";
import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";

// What a ticket or a pull request waits for. `you` means the person reads it
// and answers. `agent` means an agent still has work on it. `github` means
// only a check still runs. `ready` means nothing holds the ticket back and
// anybody can start it. `merge` means another ticket must merge first.
// `done` means the ticket is finished or canceled.
export type Waiting = "you" | "agent" | "github" | "ready" | "merge" | "done";

export type WaitingRow = TicketSummary | TicketPr;

const isTicket = (row: WaitingRow): row is TicketSummary => "prRows" in row;

// Nobody can do anything about a check that still runs, so a pull request
// that needs only that waits for GitHub. Every other missing part waits for
// the agent that wrote the pull request.
const waitsForGithub = (pullRequest: TicketPr): boolean =>
	pullRequest.state === "open" &&
	pullRequest.reviewGaps.length > 0 &&
	pullRequest.reviewGaps.every((gap) => gap.kind === "checks-pending");

const waitsForAgent = (pullRequest: TicketPr): boolean =>
	pullRequest.state === "open" && !readyForReview(pullRequest) && !waitsForGithub(pullRequest);

export function waitingFor(row: WaitingRow, hasWorkingRun: boolean): Waiting {
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
	if (ticket?.status.category === "review") return "you";
	if (hasWorkingRun || pullRequests.some((pullRequest) => waitsForAgent(pullRequest))) return "agent";
	if (pullRequests.some((pullRequest) => waitsForGithub(pullRequest))) return "github";
	if (pullRequests.some((pullRequest) => pullRequest.state === "open" && readyForReview(pullRequest))) return "you";
	if (ticket?.status.category === "todo" && ticket.ready) return "ready";
	if (ticket?.status.category === "todo") return "merge";
	if (ticket === null) return "done";
	return "agent";
}
