import { TicketId } from "@trellis/ui";
import { TicketLink } from "../../../../shell/TicketLink";

// The identifier column of the statistics page. A row whose record names no
// ticket prints that, because a missing field stays missing.
//
// The link is 28 px tall on a pointer screen and 44 px on a touch screen,
// which are the smallest hit areas of the design checklist.
const linkClass =
	"inline-flex h-7 items-center rounded-md transition-colors duration-hover pointer-coarse:h-11 hover:[&_span]:text-fg focus-visible:outline-2 focus-visible:outline-accent";

export type TicketCellProps = {
	identifier: string | null;
	// The title of the ticket, which the link shows on hover.
	title?: string | null;
};

export function TicketCell({ identifier, title }: TicketCellProps) {
	if (identifier === null) return <span className="text-fg-faint text-xs">No ticket</span>;
	return (
		<TicketLink identifier={identifier} title={title ?? undefined} className={linkClass}>
			<TicketId id={identifier} />
		</TicketLink>
	);
}
