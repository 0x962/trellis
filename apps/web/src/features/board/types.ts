import type { Status, StatusCategory, TicketSummary } from "@trellis/api";

export type BoardColumnModel = {
	id: string;
	name: string;
	category: StatusCategory;
	statuses: Status[];
	items: TicketSummary[];
	count: number;
	wipLimit: number | null;
};

// One board move: the card and the column it lands in. A column has no
// manual order, so a move names no neighbour.
export type BoardMove = {
	ticket: TicketSummary;
	column: BoardColumnModel;
};
