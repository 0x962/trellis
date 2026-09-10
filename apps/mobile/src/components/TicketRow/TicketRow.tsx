import type { TicketSummary } from "@trellis/api";

export type TicketRowProps = {
	ticket: TicketSummary;
	// Takes the identifier of the pressed ticket, such as CDE-42.
	onPress: (identifier: string) => void;
};

// One ticket in a list: the priority mark, the identifier, the title, the
// status mark, the check ribbon, and the last actor.
export function TicketRow(_props: TicketRowProps) {
	return null;
}
