import type { TicketSummary } from "../schemas/ticket.ts";
import { factSeparator } from "./separators.ts";

// The two cells the epic page adds to a ticket row, in the words a terminal
// prints. `packages/cli/src/output.ts` puts them in the shared ticket table,
// so `trellis list` and `trellis search` print them too.

const maxShownWaits = 2;

// The page marks a question with a yellow dot. A terminal has no color, so
// the word `asks` takes the place of the dot.
export const ticketWaitsCell = (ticket: Pick<TicketSummary, "ready" | "waitsOn">): string => {
	if (ticket.waitsOn.length === 0) return ticket.ready ? "ready" : "";
	const shown = ticket.waitsOn
		.slice(0, maxShownWaits)
		.map((dependency) => (dependency.isQuestion ? `${dependency.identifier} asks` : dependency.identifier))
		.join(factSeparator);
	const rest = ticket.waitsOn.length - maxShownWaits;
	return rest > 0 ? `${shown} +${rest}` : shown;
};

// How many tickets wait for this one. A ticket that releases nothing prints
// no text.
export const ticketReleasesCell = (ticket: Pick<TicketSummary, "releases">): string =>
	ticket.releases.length === 0 ? "" : String(ticket.releases.length);
