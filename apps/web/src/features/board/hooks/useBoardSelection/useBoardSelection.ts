import type { TicketSummary } from "@trellis/api";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEscapeLayer } from "../../../../lib/hotkeys";
import type { SelectionOwner } from "../../../command/commandStore";
import { useRowSelection } from "../../../table/hooks/useRowSelection";
import type { BoardColumnModel } from "../../types";
import type { CardsOfColumn } from "../useVisibleCards";
import { columnSelectionStep } from "./columnSelection";

export type BoardSelection = {
	// The selected cards, in the order the board draws them.
	rows: TicketSummary[];
	count: number;
	isSelected: (ticketId: string) => boolean;
	// `x` on a card, and a cmd or ctrl click on it.
	toggle: (columnId: string, ticketId: string) => void;
	// `shift+j`, `shift+k`, and a shift click.
	extend: (columnId: string, ticketId: string) => void;
	// `mod+a`: every card of that column.
	selectAll: (columnId: string) => void;
	// A click on a card. It returns true when the modifier keys of the click
	// changed the selection, and false for a plain click, which opens the
	// ticket instead.
	click: (columnId: string, ticketId: string, keys: ModifierKeys) => boolean;
	clear: () => void;
	// The Select all and Clear selection rows of the command palette. Select
	// all takes the column that holds the focused card.
	owner: SelectionOwner;
};

// The modifier keys of a click. A shift click grows the selection and a cmd
// or ctrl click selects and deselects one card.
export type ModifierKeys = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

export type BoardSelectionOptions = {
	columns: readonly BoardColumnModel[];
	// The cards each column draws. A rail draws none, and a done column
	// draws the tickets completed in the last 30 days.
	cardsOf: CardsOfColumn;
	// The identifier of the card that holds the keyboard focus.
	focusedCard: string | null;
	// Writes one sentence into the board's live region.
	say: (message: string) => void;
};

const noIds: string[] = [];

// The board selection, scoped to one column.
//
// `useRowSelection` takes the card ids of the column that holds the focused
// card. A range and a select-all read that list, and every select action
// starts at a card that already holds the focus, so that list is the list of
// the column the person acts in. The list holds the drawn cards of that
// column, so a card the board hides never enters the selection and never
// takes a bulk write. `selectionColumn` names the column whose cards are
// selected now. It is a ref and not state, because two actions of one key
// press read it, as `shift+j` does when it selects the focused card and then
// extends to the next one.
export const useBoardSelection = ({ columns, cardsOf, focusedCard, say }: BoardSelectionOptions): BoardSelection => {
	const selectionColumn = useRef<string | null>(null);
	const focusedColumn = useMemo(
		() => columns.find((entry) => cardsOf(entry).some((ticket) => ticket.identifier === focusedCard)),
		[cardsOf, columns, focusedCard],
	);
	const focusedIds = useMemo(
		() => (focusedColumn === undefined ? noIds : cardsOf(focusedColumn).map((ticket) => ticket.id)),
		[cardsOf, focusedColumn],
	);
	const {
		isSelected,
		toggle: toggleId,
		extend: extendId,
		selectAll: selectAllIds,
		clear: clearIds,
	} = useRowSelection({ ids: focusedIds });

	const rows = useMemo(
		() => columns.flatMap((column) => cardsOf(column)).filter((ticket) => isSelected(ticket.id)),
		[cardsOf, columns, isSelected],
	);
	const count = rows.length;

	// A bulk status write moves the selected cards to another column while
	// they stay selected. `selectionColumn` then follows the cards, so the
	// next pick in their old column starts a new selection there.
	const held = rows[0];
	if (held !== undefined) {
		selectionColumn.current = columns.find((column) => cardsOf(column).includes(held))!.id;
	}

	const clear = useCallback(() => {
		clearIds();
		selectionColumn.current = null;
	}, [clearIds]);

	const toggle = useCallback(
		(target: string, ticketId: string) => {
			if (columnSelectionStep(selectionColumn.current, target, "toggle").reset) clearIds();
			selectionColumn.current = target;
			toggleId(ticketId);
		},
		[clearIds, toggleId],
	);

	const extend = useCallback(
		(target: string, ticketId: string) => {
			const step = columnSelectionStep(selectionColumn.current, target, "extend");
			if (step.reset) clearIds();
			selectionColumn.current = target;
			if (step.action === "toggle") toggleId(ticketId);
			else extendId(ticketId);
		},
		[clearIds, extendId, toggleId],
	);

	// A select-all writes the whole set of ids, so the cards of another
	// column leave the selection without a separate clear.
	const selectAll = useCallback(
		(target: string) => {
			selectionColumn.current = target;
			selectAllIds();
		},
		[selectAllIds],
	);

	const click = useCallback(
		(target: string, ticketId: string, keys: ModifierKeys) => {
			if (keys.shiftKey) extend(target, ticketId);
			else if (keys.metaKey || keys.ctrlKey) toggle(target, ticketId);
			else return false;
			return true;
		},
		[extend, toggle],
	);

	// No card holds the focus while the board loads, and then no column is
	// the one to select.
	const owner: SelectionOwner = {
		selectAll: () => {
			if (focusedColumn === undefined) return;
			selectAll(focusedColumn.id);
		},
		clear,
	};

	// The live region carries the drag messages of the board. A count change
	// reaches a screen reader the same way.
	const said = useRef(0);
	useEffect(() => {
		if (count === said.current) return;
		said.current = count;
		say(count === 0 ? "Selection cleared" : `${count} ${count === 1 ? "card" : "cards"} selected`);
	}, [count, say]);

	useEscapeLayer("selection", count > 0, clear);

	return { rows, count, isSelected, toggle, extend, selectAll, click, clear, owner };
};
