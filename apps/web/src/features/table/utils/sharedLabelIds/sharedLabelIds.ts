import type { TicketSummary } from "@trellis/api";

// The ids of the labels that every one of these tickets holds. The bulk
// label picker checks a row only when the whole selection carries it, so a
// pick on a checked row removes that label from every selected ticket.
export const sharedLabelIds = (tickets: readonly TicketSummary[]): string[] => {
	const first = tickets[0];
	if (first === undefined) return [];
	const rest = tickets.slice(1);
	return first.labels
		.map((label) => label.id)
		.filter((id) => rest.every((ticket) => ticket.labels.some((label) => label.id === id)));
};
