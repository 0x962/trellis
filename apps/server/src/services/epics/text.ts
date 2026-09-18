import type { Epic, EpicSummary, MilestoneSummary, TicketSummary } from "@trellis/api";

// The header line of a brief for a ticket that belongs to an epic. The
// progress counts the done tickets against the tickets that are not
// canceled: a canceled ticket is never done and never in the denominator.
export const epicHeaderLine = (epic: EpicSummary) =>
	`- Epic: ${epic.name} (${epic.ref}), ${epic.counts.done} of ${epic.counts.total - epic.counts.canceled} done`;

// The header line of a brief for a ticket that belongs to a milestone, with
// the progress rule of the epic line.
export const milestoneHeaderLine = (milestone: MilestoneSummary) =>
	`- Milestone: ${milestone.name} (${milestone.ref}), ${milestone.counts.done} of ${milestone.counts.total - milestone.counts.canceled} done`;

// The two epic sections of a brief: the plan in full, then every ticket of
// the epic with its status name. `ticketId` is the ticket the brief is
// about, and its line ends with `(this ticket)`. An epic with no milestone
// lists its tickets in number order. An epic with milestones prints one
// `### <name>` group per milestone in position order, then `### No
// milestone` for the tickets outside every milestone; the tickets of a group
// stay in number order. A milestone with no ticket prints its heading alone.
export const epicLines = (epic: Epic, ticketId: string): string[][] => {
	const line = (ticket: TicketSummary) =>
		`- ${ticket.identifier} ${ticket.title} (${ticket.status.name})${ticket.id === ticketId ? " (this ticket)" : ""}`;
	const group = (name: string, tickets: TicketSummary[]) => [
		"",
		`### ${name}`,
		...(tickets.length === 0 ? [] : ["", ...tickets.map(line)]),
	];
	const outside = epic.tickets.filter((ticket) => ticket.milestone === null);
	const tickets =
		epic.milestones.length === 0
			? ["", ...epic.tickets.map(line)]
			: [
					...epic.milestones.flatMap((milestone) =>
						group(
							milestone.name,
							epic.tickets.filter((ticket) => ticket.milestone?.id === milestone.id),
						),
					),
					...(outside.length === 0 ? [] : group("No milestone", outside)),
				];
	return [
		[`## Epic: ${epic.name}`, "", epic.description],
		["## Epic tickets", ...tickets],
	];
};
