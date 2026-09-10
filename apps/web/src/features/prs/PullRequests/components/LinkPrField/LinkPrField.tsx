import type { TicketSummary } from "@trellis/api";

export type LinkPrFieldProps = {
	ticket: TicketSummary;
};

// The field that links a pull request URL to the ticket. A refused URL and a
// gh failure both answer in the field.
export function LinkPrField(_props: LinkPrFieldProps) {
	return null;
}
