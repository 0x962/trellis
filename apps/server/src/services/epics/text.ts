import type { Epic, EpicSummary, TicketSummary, WaveSummary } from "@trellis/api";

// The header line of a brief for a ticket that belongs to an epic. The
// progress counts the done tickets against the tickets that are not
// canceled: a canceled ticket is never done and never in the denominator.
export const epicHeaderLine = (epic: EpicSummary) =>
	`- Epic: ${epic.name} (${epic.ref}), ${epic.counts.done} of ${epic.counts.total - epic.counts.canceled} done`;

// The header line of a brief for a ticket that belongs to a wave, with
// the progress rule of the epic line.
export const waveHeaderLine = (wave: WaveSummary) =>
	`- Wave: ${wave.name} (${wave.ref}), ${wave.counts.done} of ${wave.counts.total - wave.counts.canceled} done`;

// The two epic sections of a brief: the plan in full, then every ticket of
// the epic with its status name. `ticketId` is the ticket the brief is
// about, and its line ends with `(this ticket)`. An epic with no wave
// lists its tickets in number order. An epic with waves prints one
// `### <name>` group per wave in position order, then `### No
// wave` for the tickets outside every wave; the tickets of a group
// stay in number order. A wave with no ticket prints its heading alone.
export const epicLines = (epic: Epic, ticketId: string): string[][] => {
	const line = (ticket: TicketSummary) =>
		`- ${ticket.identifier} ${ticket.title} (${ticket.status.name})${ticket.id === ticketId ? " (this ticket)" : ""}`;
	const group = (name: string, tickets: TicketSummary[]) => [
		"",
		`### ${name}`,
		...(tickets.length === 0 ? [] : ["", ...tickets.map(line)]),
	];
	const outside = epic.tickets.filter((ticket) => ticket.wave === null);
	const tickets =
		epic.waves.length === 0
			? ["", ...epic.tickets.map(line)]
			: [
					...epic.waves.flatMap((wave) =>
						group(
							wave.name,
							epic.tickets.filter((ticket) => ticket.wave?.id === wave.id),
						),
					),
					...(outside.length === 0 ? [] : group("No wave", outside)),
				];
	return [
		[`## Epic: ${epic.name}`, "", epic.description],
		["## Epic tickets", ...tickets],
	];
};

export const RESULT_COMMENT_MAX = 1200;

// The done tickets of each wave that comes before the wave of the
// ticket `ticketId`, in position order. A ticket with no wave has no
// earlier wave. A wave with no done ticket is not in the list.
export const earlierResults = (epic: Epic, ticketId: string) => {
	const own = epic.tickets.find((ticket) => ticket.id === ticketId)?.wave?.id;
	const end = epic.waves.findIndex((wave) => wave.id === own);
	return epic.waves
		.slice(0, Math.max(end, 0))
		.map((wave) => ({
			wave,
			tickets: epic.tickets.filter((ticket) => ticket.wave?.id === wave.id && ticket.status.category === "done"),
		}))
		.filter((group) => group.tickets.length > 0);
};

// The "Results of earlier waves" section of a brief: one `### <name>`
// group per wave of `earlierResults`, and one list item per done
// ticket. `lastAgentComment` maps a ticket id to the body of the last comment
// that an agent wrote on it. The body prints below the item, indented, and
// cut at RESULT_COMMENT_MAX characters. A ticket with no agent comment
// prints its item alone. No group gives no section.
export const resultsLines = (epic: Epic, ticketId: string, lastAgentComment: Map<string, string>): string[] => {
	const groups = earlierResults(epic, ticketId);
	if (groups.length === 0) return [];
	const lines = ["## Results of earlier waves"];
	for (const group of groups) {
		lines.push("", `### ${group.wave.name}`, "");
		for (const ticket of group.tickets) {
			lines.push(`- ${ticket.identifier} ${ticket.title}`);
			const body = lastAgentComment.get(ticket.id);
			if (body === undefined) continue;
			for (const line of body.slice(0, RESULT_COMMENT_MAX).trimEnd().split("\n")) lines.push(`  ${line}`);
		}
	}
	return lines;
};
