import type { TicketSummary } from "@trellis/api";
import { StatusIcon } from "@trellis/ui";
import { ArrowRight } from "lucide-react";
import type { PaletteRow, RowDeps } from "../../rows";
import { viewHref } from "../viewHref";

// The Search results section and the jump row a typed identifier makes.

// Enter on a result opens the peek over the page the person is on.
const openPeek = (deps: RowDeps, identifier: string) => () => {
	deps.close();
	deps.action.navigate(viewHref(deps.pathname, deps.search, { peek: identifier }));
};

export const resultRows = (tickets: TicketSummary[], deps: RowDeps): PaletteRow[] =>
	tickets.map((ticket) => ({
		value: ticket.identifier,
		label: ticket.title,
		sub: ticket.identifier,
		mono: true,
		icon: <StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? "human"} />,
		keywords: [ticket.identifier],
		run: openPeek(deps, ticket.identifier),
	}));

// A typed `KEY-n` opens the ticket itself, so the palette answers before
// any response arrives.
export const jumpRow = (identifier: string, deps: RowDeps): PaletteRow => ({
	value: identifier,
	label: `Open ${identifier}`,
	icon: <ArrowRight />,
	run: () => {
		deps.close();
		deps.action.navigate(`/t/${identifier}`);
	},
});
