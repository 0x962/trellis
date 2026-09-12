import { ArrowRight } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { StatusIcon } from "@trellis/ui";
import type { PaletteRow, RowDeps } from "../../rows";
import { viewHref } from "../viewHref";

// The Tickets section and the jump row a typed ID makes.

// The ticket page and Settings draw no peek, so a picked ticket opens its
// own page there. Every list route opens the peek over the page.
const hasPeek = (pathname: string) => !pathname.startsWith("/t/") && pathname !== "/settings";

const openTicket = (deps: RowDeps, identifier: string) => () => {
	deps.close();
	deps.action.navigate(
		hasPeek(deps.pathname) ? viewHref(deps.pathname, deps.search, { peek: identifier }) : `/t/${identifier}`,
	);
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
		deps.action.navigate(`/t/${identifier}`);
	},
});
