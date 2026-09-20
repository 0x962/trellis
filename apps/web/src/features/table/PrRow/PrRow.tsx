import type { TicketPr } from "@trellis/api";
import { cx, PrGlyph } from "@trellis/ui";
import { Fragment } from "react";
import { tabularClass } from "../../../lib/format";
import { prRowHeight } from "../rowHeights";
import { type PrRowTone, prRowCells } from "./prRowText";

export type PrRowProps = {
	pr: TicketPr;
	// The offset of this line inside the virtual body.
	top: number;
};

// The color class of each tone. The row is `text-fg-muted`, so a muted cell
// takes no class of its own.
const toneClass: Record<PrRowTone, string | undefined> = {
	fg: "text-fg",
	muted: undefined,
	danger: "text-danger",
};

// One pull request of a ticket, on the line under that ticket's row in the
// epic table. The line is 32 px tall whatever it holds, because the
// virtualizer reserves that height before the line renders.
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
			className="absolute top-0 left-0 flex w-full items-center gap-2 overflow-hidden border-b border-border pr-5 pl-11 text-sm text-fg-muted max-md:pr-4 max-md:pl-10"
		>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} size="sm" />
			<span className={cx("shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			{prRowCells(pr).map((cell, index) => (
				<Fragment key={cell.key}>
					{index > 0 && (
						<span aria-hidden="true" className="shrink-0 text-fg-faint">
							·
						</span>
					)}
					<span className={cx("shrink-0", tabularClass, toneClass[cell.tone])}>{cell.text}</span>
				</Fragment>
			))}
		</div>
	);
}
