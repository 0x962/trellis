import type { TicketSummary } from "@trellis/api";
import { useCallback, useMemo } from "react";
import type { BoardColumnModel } from "../../types";
import { visibleCards } from "../../utils/visibleCards";

// Answers the cards one column of the board draws now.
export type CardsOfColumn = (column: BoardColumnModel) => readonly TicketSummary[];

export type VisibleCardsOptions = {
	columns: readonly BoardColumnModel[];
	// The ids of the columns the person collapsed to a rail.
	collapsedColumnIds: readonly string[];
	// True after the person pressed "Show all done tickets".
	showAllDone: boolean;
};

// The drawn cards of every column, held in one map that changes only when
// the columns, the rails, or the done window change. The keyboard map and
// the selection call the answer for the column they act in, so a key and a
// bulk write reach the cards the person sees.
export const useVisibleCards = ({ columns, collapsedColumnIds, showAllDone }: VisibleCardsOptions): CardsOfColumn => {
	const cards = useMemo(
		() =>
			new Map(
				columns.map((column) => [
					column.id,
					visibleCards(column, { collapsed: collapsedColumnIds.includes(column.id), showAllDone }),
				]),
			),
		[columns, collapsedColumnIds, showAllDone],
	);
	return useCallback((column: BoardColumnModel) => cards.get(column.id)!, [cards]);
};
