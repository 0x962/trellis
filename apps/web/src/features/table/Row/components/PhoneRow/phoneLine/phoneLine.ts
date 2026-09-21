import { type TicketPr, type TicketSummary, ticketWaitsCell } from "@trellis/api";
import type { TicketAgentLine } from "../../../../utils/agentLines";

// The second line of a ticket row on the epic table below 768 px. It holds
// one fact, so the row stays two lines of 56 px.
export type PhoneLine =
	| { kind: "agent"; line: TicketAgentLine }
	| { kind: "pr"; pr: TicketPr }
	| { kind: "waits"; words: string }
	| { kind: "releases"; words: string };

// A ticket can link a closed pull request and a newer open one. The open
// one is the work in flight, so it takes the line.
const shownPr = (prRows: readonly TicketPr[]) => prRows.find((pr) => pr.state === "open") ?? prRows[0];

// The first fact that the ticket holds, in this order: what its run says,
// its pull request, the tickets it waits on, and how many tickets wait for
// it. Null when the ticket holds none of the four.
export const phoneLineOf = (
	ticket: Pick<TicketSummary, "prRows" | "waitsOn" | "ready" | "releases">,
	agentLine: TicketAgentLine | null,
): PhoneLine | null => {
	if (agentLine !== null) return { kind: "agent", line: agentLine };
	const pr = shownPr(ticket.prRows);
	if (pr !== undefined) return { kind: "pr", pr };
	if (ticket.waitsOn.length > 0) return { kind: "waits", words: `waits on ${ticketWaitsCell(ticket)}` };
	if (ticket.releases.length > 0) return { kind: "releases", words: `releases ${ticket.releases.length}` };
	return null;
};
