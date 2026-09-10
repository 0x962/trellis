import type { TicketSummary } from "@trellis/api";
import type { ReactNode } from "react";

export type InboxRowProps = {
	ticket: TicketSummary;
	// The buttons the row shows on hover. They stay in the tab order, so no
	// action is hover-only.
	actions?: ReactNode;
	// 0 on the one row the section's roving tabindex points at, -1 on the rest.
	tabIndex?: number;
};

// One ticket in a Needs you section. Every row is the same height, whether
// or not the ticket has a parent, a pull request, or sub-tickets.
export function InboxRow(_props: InboxRowProps) {
	return null;
}
