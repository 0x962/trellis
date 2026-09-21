import { ArrowRight } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { StatusIcon } from "@trellis/ui";
import { pageSheetActions } from "../../../../stores/pageSheetStore";
import type { PaletteRow, RowDeps } from "../../rows";

// The Tickets section and the jump row a typed ID makes.

const openTicket = (deps: RowDeps, identifier: string) => () => {
	deps.close();
	pageSheetActions.openTicket(identifier);
};

// A ticket row reads like a list row: the status icon, the ID in faint
// mono, then the title.
export const resultRows = (tickets: TicketSummary[], deps: RowDeps): PaletteRow[] =>
	tickets.map((ticket) => ({
		value: ticket.identifier,
		label: ticket.title,
		prefix: ticket.identifier,
		icon: <StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? "human"} />,
		keywords: [ticket.identifier],
		run: openTicket(deps, ticket.identifier),
	}));

// A typed `KEY-n` opens the ticket itself, so the palette answers before
// any response arrives.
export const jumpRow = (identifier: string, deps: RowDeps): PaletteRow => ({
	value: identifier,
	label: `Open ${identifier}`,
	icon: <ArrowRight />,
	run: () => {
		deps.close();
		pageSheetActions.openTicket(identifier);
	},
});
