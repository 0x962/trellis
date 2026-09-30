import type { TicketSummary } from "@trellis/api";

export type WaveBranch = { ticket: TicketSummary; children: WaveBranch[] };

export const unfinishedDependencies = (ticket: TicketSummary) =>
	ticket.waitsOn.filter((dependency) => dependency.status !== "done" && dependency.status !== "canceled");

// A ticket appears once, under its first unfinished prerequisite in the wave.
// The ticket row names every unfinished prerequisite, including other waves.
export function waveTree(tickets: readonly TicketSummary[]): WaveBranch[] {
	const nodes = new Map(tickets.map((ticket) => [ticket.identifier, { ticket, children: [] } as WaveBranch]));
	const roots: WaveBranch[] = [];
	for (const ticket of tickets) {
		const node = nodes.get(ticket.identifier)!;
		const parent = unfinishedDependencies(ticket).find((dependency) => nodes.has(dependency.identifier));
		if (parent) nodes.get(parent.identifier)!.children.push(node);
		else roots.push(node);
	}
	return roots;
}
