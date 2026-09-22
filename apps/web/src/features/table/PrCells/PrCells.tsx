import type { TicketPr } from "@trellis/api";
import { cx, PrGlyph, ReviewStateIcon } from "@trellis/ui";
import { tabularClass } from "../../../lib/format";
import type { PrRowCell } from "../PrRow/prRowText";

// What the person said about the head commit of the pull request in the
// local review. The mark carries these words and not the GitHub review
// words, because the verdict is that person's own.
const verdictWords = { approved: "You approved this commit", changes_requested: "You asked for changes" } as const;

// The glyph, the number, the title and the verdict mark of one pull
// request. The epic table draws them on the line under a ticket row, and a
// phone row draws them on its second line with the shorter `prPhoneCells`.
//
// Each part takes a column of its own, so every title starts at the same x.
// The number takes a fixed 56 px and tabular digits, which fits a `#` and
// six digits at 14 px. The verdict mark follows the title, so a pull
// request with a verdict and one without start their titles at the same x.
export function PrCells({ pr, cells }: { pr: TicketPr; cells: readonly PrRowCell[] }) {
	return (
		<>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} localState={pr.localState} size="sm" />
			<span className={cx("w-14 shrink-0 text-fg", tabularClass)}>#{pr.number}</span>
			{cells.map((cell) => (
				<span key={cell.key} title={cell.text} className="min-w-0 flex-1 truncate text-fg">
					{cell.text}
				</span>
			))}
			{pr.verdict && <ReviewStateIcon reviewState={pr.verdict} isDraft={false} label={verdictWords[pr.verdict]} />}
		</>
	);
}
