export type FlowTargetTicket = { identifier: string; title: string; description: string };
export type FlowTargetPull = { url: string; head_ref: string; base_ref: string; state: string };

// The ticket and its pull requests, as the first thing a flow agent reads
// after the briefing. The agent then knows its target without a search.
export function flowTarget(ticket: FlowTargetTicket, pulls: readonly FlowTargetPull[]): string {
	const lines = [`Ticket ${ticket.identifier}: ${ticket.title}`];
	const description = ticket.description.trim();
	if (description !== "") lines.push("", description);
	lines.push("", pulls.length === 0 ? "Pull requests: none linked to the ticket." : "Pull requests:");
	for (const pull of pulls) lines.push(`- ${pull.url} (${pull.head_ref} into ${pull.base_ref}, ${pull.state})`);
	return lines.join("\n");
}
