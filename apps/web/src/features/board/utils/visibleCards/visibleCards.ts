import type { TicketSummary } from "@trellis/api";
import type { BoardColumnModel } from "../../types";

// The state of one column on screen. `collapsed` is true while the column
// is a rail. `showAllDone` is true after the person pressed "Show all done
// tickets", which holds for every done column of the board.
export type ColumnView = { collapsed: boolean; showAllDone: boolean };

// A done ticket leaves the board this long after it was completed.
const doneWindowMs = 30 * 86_400_000;

// The cards one column draws now.
//
// A rail draws no card. A done column draws the tickets completed in the
// last 30 days until the person asks for all of them. Every other column
// draws every ticket it holds.
//
// The column, the keyboard map, and the selection read this one list, so a
// key press and a bulk write reach the cards the person sees and no others.
export const visibleCards = (column: BoardColumnModel, view: ColumnView): readonly TicketSummary[] => {
	if (view.collapsed) return [];
	if (column.category !== "done" || view.showAllDone) return column.items;
	const cutoff = Date.now() - doneWindowMs;
	return column.items.filter((ticket) => ticket.completedAt !== null && Date.parse(ticket.completedAt) >= cutoff);
};
