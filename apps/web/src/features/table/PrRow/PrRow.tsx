import type { TicketPr } from "@trellis/api";
import { cx, LineChanges, PrGlyph } from "@trellis/ui";
import { Fragment } from "react";
import { tabularClass } from "../../../lib/format";
import { prRowHeight } from "../rowHeights";
import { type PrRowCell, type PrRowTone, prRowCells } from "./prRowText";

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

// `LineChanges` draws the changed line counts everywhere in the app: the
// plus in `text-success`, the minus in `text-danger`, the digits grouped by
// thousands and a label for a screen reader. `align="start"` takes the
// width of the text, for counts that follow other text.
//
// `pending={false}` because the row draws no cell at all while GitHub has
// not measured the pull request.
const cellContent = (cell: PrRowCell) =>
	"lines" in cell ? (
		<LineChanges value={cell.lines} pending={false} align="start" />
	) : (
		<span className={cx("shrink-0", tabularClass, toneClass[cell.tone])}>{cell.text}</span>
	);

// The glyph, the number and the cells of one pull request. The epic table
// draws them on the line under a ticket row, and a phone row draws them on
// its second line with the shorter `prPhoneCells`.
export function PrCells({ pr, cells }: { pr: TicketPr; cells: readonly PrRowCell[] }) {
	return (
		<>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} size="sm" />
			<span className={cx("shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			{cells.map((cell, index) => (
				<Fragment key={cell.key}>
					{index > 0 && (
						<span aria-hidden="true" className="shrink-0 text-fg-faint">
							·
						</span>
					)}
					{cellContent(cell)}
				</Fragment>
			))}
		</>
	);
}

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
			className="absolute top-0 left-0 flex w-full items-center gap-2 overflow-hidden border-b border-border pr-5 pl-11 text-sm text-fg-muted"
		>
			<PrCells pr={pr} cells={prRowCells(pr)} />
		</div>
	);
}
