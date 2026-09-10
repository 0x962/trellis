import type { TicketSummary } from "@trellis/api";
import type { Density } from "../../../stores/uiStore";

export type RowProps = {
	ticket: TicketSummary;
	density: Density;
	// The visible column ids, in order.
	columns: string[];
	// The project ref of the route, or undefined on /all.
	viewedProject?: string;
};

// The fixed row box per density. The virtualizer estimates with the same
// number, so a row never changes the scroll height.
export const rowHeights: Record<Density, number> = { comfortable: 0, compact: 0 };

// Skeleton for the web-table work item. The tests beside it state the outcomes.
export function Row(_props: RowProps) {
	return null;
}
