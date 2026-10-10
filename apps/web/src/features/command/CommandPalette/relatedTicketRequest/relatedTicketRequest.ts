import type { TicketSummary } from "@trellis/api";
export type RelatedTicketRequest = {
	scope: string;
	project: string;
	initialTitle: string;
	onCreated: (ticket: TicketSummary) => void;
};
