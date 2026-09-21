import type { TicketPr } from "@trellis/api";
import { cx, PrGlyph, ReviewStateIcon } from "@trellis/ui";
import { tabularClass } from "../../../lib/format";
import type { PrRowCell } from "../PrRow/prRowText";

// The glyph, the number, the verdict mark and the cells of one pull request. The epic table
// draws them on the line under a ticket row, and a phone row draws them on
// its second line with the shorter `prPhoneCells`.
export function PrCells({ pr, cells }: { pr: TicketPr; cells: readonly PrRowCell[] }) {
	return (
		<>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} size="sm" />
			<span className={cx("shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			{pr.verdict && <ReviewStateIcon reviewState={pr.verdict} isDraft={false} />}
			{cells.map((cell) => (
				<span key={cell.key} title={cell.text} className="min-w-0 flex-1 truncate text-fg">
					{cell.text}
				</span>
			))}
		</>
	);
}
