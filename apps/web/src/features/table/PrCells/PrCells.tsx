import type { TicketPr } from "@trellis/api";
import { cx, PrGlyph } from "@trellis/ui";
import { tabularClass } from "../../../lib/format";
import type { PrRowCell } from "../PrRow/prRowText";

// The glyph, the number and the cells of one pull request. The epic table
// draws them on the line under a ticket row, and a phone row draws them on
// its second line with the shorter `prPhoneCells`.
export function PrCells({ pr, cells }: { pr: TicketPr; cells: readonly PrRowCell[] }) {
	return (
		<>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} size="sm" />
			<span className={cx("shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			{cells.map((cell) => (
				<span key={cell.key} title={cell.text} className="min-w-0 flex-1 truncate text-fg">
					{cell.text}
				</span>
			))}
		</>
	);
}
