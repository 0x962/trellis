import type { TicketSummary } from "@trellis/api";

export type WaveSkip = { ticket: TicketSummary; reason: string };

// The tickets of one wave that the Start wave dialog starts, and the ones it
// skips with the reason in words. `start` holds each ticket whose `ready`
// flag is true and whose id is not in `assigned`. The server sets `ready` for
// a Todo ticket whose every dependency is done. `assigned` holds the tickets
// with an open agent run, from `assignedTicketIds`: an agent that starts,
// works, or waits idle still holds its ticket.
export type WavePlan = { start: TicketSummary[]; skip: WaveSkip[] };

// Null when the ticket is ready to start. A ticket with an agent reads "already
// running" whatever its status. A ticket past Todo reads its status name,
// such as "done". A Todo ticket that is not ready names the tickets it
// waits on, such as "blocked by OP-32, OP-33".
export const skipReason = (ticket: TicketSummary, assigned: ReadonlySet<string>): string | null => {
	if (assigned.has(ticket.id)) return "already running";
	if (ticket.status.category !== "todo") return ticket.status.name.toLowerCase();
	if (ticket.ready) return null;
	return `blocked by ${ticket.waitsOn.map((dependency) => dependency.identifier).join(", ")}`;
};

export const wavePlan = (tickets: readonly TicketSummary[], assigned: ReadonlySet<string>): WavePlan => {
	const plan: WavePlan = { start: [], skip: [] };
	for (const ticket of tickets) {
		const reason = skipReason(ticket, assigned);
		if (reason === null) plan.start.push(ticket);
		else plan.skip.push({ ticket, reason });
	}
	return plan;
};

export const startLabel = (count: number) => `Start ${count} ${count === 1 ? "agent" : "agents"}`;
