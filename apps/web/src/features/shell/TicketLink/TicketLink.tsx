import type { ReactNode } from "react";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { opensSheet } from "./opensSheet";

export type TicketLinkProps = {
	// The canonical identifier, `TRL-42`.
	identifier: string;
	className?: string;
	title?: string;
	// `InboxRow` clones the link with the cells of the row as its children.
	children?: ReactNode;
};

// The name of a ticket in a list. A plain click opens the ticket in the
// sheet stack. The href is the route of the ticket page, so the link reads
// as a link and a new tab lands on the page.
export function TicketLink({ identifier, className, title, children }: TicketLinkProps) {
	return (
		<a
			href={`/t/${identifier}`}
			className={className}
			title={title}
			onClick={(event) => {
				if (!opensSheet(event)) return;
				event.preventDefault();
				pageSheetActions.openTicket(identifier);
			}}
		>
			{children}
		</a>
	);
}
