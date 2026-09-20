import { cloneElement, type ReactElement, type ReactNode } from "react";
import { TicketId } from "../TicketId";

// An anchor that the caller builds, such as a router Link. A ticket line
// gives it the class names, the title and the children of the line, so the
// caller writes where the line goes and this file writes how it looks.
export type TicketAnchor = ReactElement<{ className?: string; title?: string; children?: ReactNode }>;

// One row of a ticket that a person clicks: the whole row is the link, it
// fills the width of its block, and the title loses its end rather than
// wrapping.
export const ticketLineClass =
	"-mx-1 flex min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 text-sm text-fg transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:py-2";

// One ticket that another block names, with the anchor that opens it.
export type TicketRef = {
	identifier: string;
	title: string;
	link: TicketAnchor;
};

export type TicketLineProps = TicketRef & {
	// A mark before the identifier, such as the status of a ticket. It keeps
	// its own colour, so it sits in the row with no wrapper around it.
	mark?: ReactNode;
	// A muted word before the identifier, such as `answered:` on the question
	// a ticket applied.
	lead?: string;
	// A muted word between the identifier and the title, such as `open.` on
	// the question a ticket applies.
	note?: string;
	// Marks and words at the end of the line, such as the state of a run.
	end?: ReactNode;
};

// A ticket identifier, an optional muted word, the title, and whatever the
// caller puts at the end. The chain block and the question block draw their
// ticket rows with this line.
export function TicketLine({ identifier, title, link, mark, lead, note, end }: TicketLineProps) {
	return cloneElement(link, {
		className: ticketLineClass,
		title,
		children: (
			<>
				{mark}
				{lead !== undefined && <span className="shrink-0 text-fg-muted">{lead}</span>}
				<TicketId id={identifier} size="sm" />
				{note !== undefined && <span className="shrink-0 text-fg-muted">{note}</span>}
				<span className="min-w-0 flex-1 truncate">{title}</span>
				{end}
			</>
		),
	});
}
