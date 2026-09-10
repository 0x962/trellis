import type { TicketSummary } from "@trellis/api";
import type { ReactElement, ReactNode } from "react";

export type InboxSectionProps = {
	name: string;
	// Every row the server holds for the section, which can be more than the
	// 100 rows `items` carries.
	total: number;
	icon?: ReactElement;
	// The muted text on the right of the header: the keys, or the rule the
	// section follows.
	hint?: ReactNode;
	open: boolean;
	onToggle: () => void;
	rows: TicketSummary[];
	// The identifier of the row that holds the tab stop.
	focusedId?: string | null;
	renderActions?: (ticket: TicketSummary) => ReactNode;
};

// The frame every Needs you section shares: a header button that opens and
// closes the section, and a grid of rows with one tab stop.
export function InboxSection(_props: InboxSectionProps) {
	return null;
}
