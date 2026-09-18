import type { KeyboardEvent } from "react";
import type { BoardColumnModel, BoardMove } from "../../../types";

export type CardKeyDownOptions = {
	columns: readonly BoardColumnModel[];
	openTicket: (identifier: string) => void;
	// Offers every status of the board for the card.
	chooseStatus: (move: BoardMove) => void;
	// Moves the card to another column, which asks for a status when that
	// column holds more than one.
	moveTo: (move: BoardMove) => void;
	setLabels: (ticketId: string) => void;
};

const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

// The keyboard map of a board card: Enter opens the ticket, `s` sets the
// status, `l` sets the labels, the bracket keys move the card one column, and
// the arrow keys move the focus.
export const cardKeyDown =
	({ columns, openTicket, chooseStatus, moveTo, setLabels }: CardKeyDownOptions) =>
	(event: KeyboardEvent<HTMLElement>, column: BoardColumnModel, index: number) => {
		const ticket = column.items[index]!;
		if (event.key === "Enter") openTicket(ticket.identifier);
		if (event.key === "s") {
			event.preventDefault();
			chooseStatus({ ticket, column });
			return;
		}
		if (event.key === "l") {
			event.preventDefault();
			setLabels(ticket.id);
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
			const targetIndex = index + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0);
			const target = targetColumn?.items[Math.max(0, Math.min(targetIndex, targetColumn.items.length - 1))];
			const element = document.querySelector<HTMLElement>(`[data-ticket-id="${target?.id}"]`);
			// The focus must not scroll the board, or the column headers leave
			// their row. The card then scrolls only its own list.
			element?.focus({ preventScroll: true });
			element?.scrollIntoView({ block: "nearest" });
		}
	};
