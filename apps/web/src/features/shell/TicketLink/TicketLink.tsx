import type { ComponentProps } from "react";
import { opensSheet } from "../../../lib/opensSheet";
import { pageSheetActions } from "../../../stores/pageSheetStore";

export type TicketLinkProps = Omit<ComponentProps<"a">, "href"> & {
	// The canonical identifier, `TRL-42`.
	identifier: string;
};

// A plain click opens the ticket over the current page. The href also
// opens the sheet when a person copies the link or uses a new tab.
export function TicketLink({ identifier, onClick, ...props }: TicketLinkProps) {
	return (
		<a
			{...props}
			href={`/t/${identifier}`}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented || !opensSheet(event)) return;
				event.preventDefault();
				pageSheetActions.openTicket(identifier);
			}}
		/>
	);
}
