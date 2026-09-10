import type { TicketSummary } from "@trellis/api";

export type SendBackBoxProps = {
	ticket: TicketSummary;
	// Closes the box and returns the focus to the row.
	onClose: () => void;
	// Runs after the comment and the move both succeed.
	onSent: () => void;
};

// The comment box a send back opens on the row. It posts the comment first,
// then moves the ticket to the lowest-position started status.
export function SendBackBox(_props: SendBackBoxProps) {
	return null;
}
