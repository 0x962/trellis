import type { ComponentProps } from "react";
import { opensSheet } from "../../../lib/opensSheet";
import { useTicketClick } from "../useTicketClick";

export type TicketLinkProps = Omit<ComponentProps<"a">, "href"> & {
	// The canonical identifier, `TRL-42`.
	identifier: string;
};

// A plain click opens the ticket over the current page. The href also
// opens the sheet when a person copies the link or uses a new tab.
export function TicketLink({ identifier, onClick, ...props }: TicketLinkProps) {
	const openTicket = useTicketClick();
	return (
		<a
			{...props}
			href={`/t/${identifier}`}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented || !opensSheet(event)) return;
				event.preventDefault();
				openTicket(identifier, event);
			}}
		/>
	);
}
