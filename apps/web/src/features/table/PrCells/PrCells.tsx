import type { TicketPr } from "@trellis/api";
import { cx, LineChanges, PrGlyph } from "@trellis/ui";
import { Fragment } from "react";
import { tabularClass } from "../../../lib/format";
import type { PrRowCell, PrRowTone } from "../PrRow/prRowText";

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
