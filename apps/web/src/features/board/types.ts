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

export type BoardMove = {
	ticket: TicketSummary;
	column: BoardColumnModel;
	after?: TicketSummary;
	before?: TicketSummary;
};
