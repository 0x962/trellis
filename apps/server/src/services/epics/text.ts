import type { Epic, EpicSummary } from "@trellis/api";

// The header line of a brief for a ticket that belongs to an epic. The
// progress counts the done tickets against the tickets that are not
// canceled: a canceled ticket is never done and never in the denominator.
export const epicHeaderLine = (epic: EpicSummary) =>
	`- Epic: ${epic.name} (${epic.ref}), ${epic.counts.done} of ${epic.counts.total - epic.counts.canceled} done`;

// The two epic sections of a brief: the plan in full, then every ticket of
// the epic in number order with its status name. `ticketId` is the ticket
// the brief is about, and its line ends with `(this ticket)`.
export const epicLines = (epic: Epic, ticketId: string): string[][] => [
	[`## Epic: ${epic.name}`, "", epic.description],
	[
		"## Epic tickets",
		"",
		...epic.tickets.map(
			(ticket) =>
				`- ${ticket.identifier} ${ticket.title} (${ticket.status.name})${ticket.id === ticketId ? " (this ticket)" : ""}`,
		),
	],
];
