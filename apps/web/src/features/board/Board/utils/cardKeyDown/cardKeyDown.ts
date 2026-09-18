import type { TicketSummary } from "@trellis/api";
import type { KeyboardEvent } from "react";
import type { BulkPicker } from "../../../../table/BulkBar";
import type { CardsOfColumn } from "../../../hooks/useVisibleCards";
import type { BoardColumnModel, BoardMove } from "../../../types";

export type CardKeyDownOptions = {
	columns: readonly BoardColumnModel[];
	// The cards each column draws. The keys move and select inside this
	// list, so they never reach a card the board hides.
	cardsOf: CardsOfColumn;
	openTicket: (identifier: string) => void;
	// Offers every status of the board for the card.
	chooseStatus: (move: BoardMove) => void;
	// Moves the card to another column, which asks for a status when that
	// column holds more than one.
	moveTo: (move: BoardMove) => void;
	setLabels: (ticketId: string) => void;
	selection: {
		count: number;
		toggle: (columnId: string, ticketId: string) => void;
		extend: (columnId: string, ticketId: string) => void;
		selectAll: (columnId: string) => void;
	};
	// Opens one control of the bulk bar over the selected cards.
	openBulk: (picker: BulkPicker) => void;
	copySelection: () => void;
	deleteSelection: () => void;
};

const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

// The focus must not scroll the board, or the column headers leave their
// row. The card then scrolls only its own list.
const focusCard = (ticket: TicketSummary | undefined) => {
	const element = document.querySelector<HTMLElement>(`[data-ticket-id="${ticket?.id}"]`);
	element?.focus({ preventScroll: true });
	element?.scrollIntoView({ block: "nearest" });
};

// The keyboard map of a board card.
//
// Selection: `x` selects and deselects the card, `shift+j` and `shift+k`
// grow the selection to the next and the previous card, and `mod+a` selects
// the whole column. A selection holds the cards of one column only.
//
// `p`, `shift+p`, `m` and `e` open the matching control of the bulk bar.
// With no card selected they first select the focused card, so the control
// writes to that one card. `s` and `l` write to the selection the same way,
// and with no card selected they open the status picker and the label
// picker of the focused card.
//
// `mod+c` copies the identifiers of the selection, and Backspace and Delete
// delete every selected card. Both keys need a selection.
//
// In every state Enter opens the ticket, the bracket keys move the card one
// column, and the arrow keys move the focus.
export const cardKeyDown =
	({
		columns,
		cardsOf,
		openTicket,
		chooseStatus,
		moveTo,
		setLabels,
		selection,
		openBulk,
		copySelection,
		deleteSelection,
	}: CardKeyDownOptions) =>
	(event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, ticket: TicketSummary) => {
		const cards = cardsOf(column);
		const index = cards.indexOf(ticket);
		const key = event.key.toLowerCase();
		const mod = event.metaKey || event.ctrlKey;
		const selected = selection.count > 0;
		// One control of the bulk bar writes to the cards under it. With no
		// card selected the focused card becomes the selection, so the control
		// writes to that one card.
		const openOne = (picker: BulkPicker) => {
			if (!selected) selection.toggle(column.id, ticket.id);
			openBulk(picker);
		};

		if (key === "x" && !mod) {
			event.preventDefault();
			selection.toggle(column.id, ticket.id);
			return;
		}
		if (key === "a" && mod) {
			event.preventDefault();
			selection.selectAll(column.id);
			return;
		}
		if ((key === "j" || key === "k") && event.shiftKey && !mod) {
			event.preventDefault();
			const next = cards[index + (key === "j" ? 1 : -1)];
			if (next === undefined) return;
			if (!selected) selection.toggle(column.id, ticket.id);
			selection.extend(column.id, next.id);
			focusCard(next);
			return;
		}
		if (key === "c" && mod && selected) {
			event.preventDefault();
			copySelection();
			return;
		}
		if ((event.key === "Backspace" || event.key === "Delete") && selected) {
			event.preventDefault();
			deleteSelection();
			return;
		}
		if (event.key === "Enter") openTicket(ticket.identifier);
		if (key === "s" && !mod) {
			event.preventDefault();
			if (selected) openBulk("status");
			else chooseStatus({ ticket, column });
			return;
		}
		if (key === "l" && !mod) {
			event.preventDefault();
			if (selected) openBulk("labels");
			else setLabels(ticket.id);
			return;
		}
		if (key === "p" && !mod) {
			event.preventDefault();
			openOne(event.shiftKey ? "parent" : "priority");
			return;
		}
		if (key === "m" && !mod) {
			event.preventDefault();
			openOne("project");
			return;
		}
		if (key === "e" && !mod) {
			event.preventDefault();
			openOne("epic");
			return;
		}
		if (event.key === "[" || event.key === "]") {
			event.preventDefault();
			const at = columns.indexOf(column) + (event.key === "[" ? -1 : 1);
			const target = columns[at];
			if (target !== undefined) moveTo({ ticket, column: target });
			return;
		}
		if (arrows.includes(event.key)) {
			event.preventDefault();
			const columnIndex = columns.indexOf(column);
			const targetColumn = columns[columnIndex + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0)];
			if (targetColumn === undefined) return;
			const targetCards = cardsOf(targetColumn);
			const targetIndex = index + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0);
			focusCard(targetCards[Math.max(0, Math.min(targetIndex, targetCards.length - 1))]);
		}
	};
