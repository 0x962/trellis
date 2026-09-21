import type { TicketPr } from "@trellis/api";
import { PrCells } from "../PrCells";
import { prRowHeight } from "../rowHeights";
import { prRowCells } from "./prRowText";

export type PrRowProps = {
	pr: TicketPr;
	// The offset of this line inside the virtual body.
	top: number;
};

// One pull request of a ticket, on the line under that ticket's row in the
// epic table. The line is 32 px tall whatever it holds, because the
// virtualizer reserves that height before the line renders. Below 768 px
// the table draws no such line, and the phone row shows the pull request.
//
// The line is text, not a control. The pull request opens from the ticket
// page and from the review page.
//
// `overflow-hidden` on the row and `shrink-0` on each cell keep the cells
// at their full width. A narrow window cuts the last cells off at the right
// edge. No cell wraps, and the row never scrolls sideways.
export function PrRow({ pr, top }: PrRowProps) {
	return (
		<div
			data-pr-row={`${pr.owner}/${pr.repo}#${pr.number}`}
			style={{ height: `${prRowHeight}px`, transform: `translateY(${top}px)` }}
			className="absolute top-0 left-0 flex w-full items-center gap-2 overflow-hidden border-b border-border pr-5 pl-19 text-sm text-fg-muted"
		>
			<PrCells pr={pr} cells={prRowCells(pr)} />
		</div>
	);
}
