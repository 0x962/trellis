import type { TicketPr } from "@trellis/api";
import { cx, PrGlyph, ReviewStateIcon } from "@trellis/ui";
import { tabularClass } from "../../../lib/format";
import type { PrRowCell } from "../PrRow/prRowText";

// The glyph, the number, the verdict mark and the cells of one pull
// request. The epic table draws them on the line under a ticket row, and a
// phone row draws them on its second line with the shorter `prPhoneCells`.
//
// Each part takes a column of its own, so every title starts at the same x.
// The number takes a fixed 56 px and tabular digits, which fits a `#` and
// six digits at 14 px. The verdict slot keeps its 20 px on a pull request
// that carries no verdict, so a line with a verdict and a line without one
// start their titles at the same x.
export function PrCells({ pr, cells }: { pr: TicketPr; cells: readonly PrRowCell[] }) {
	return (
		<>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} size="sm" />
			<span className={cx("w-14 shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			<span className="flex size-5 shrink-0 items-center justify-center">
				{pr.verdict && <ReviewStateIcon reviewState={pr.verdict} isDraft={false} />}
			</span>
			{cells.map((cell) => (
				<span key={cell.key} title={cell.text} className="min-w-0 flex-1 truncate text-fg">
					{cell.text}
				</span>
			))}
		</>
	);
}
