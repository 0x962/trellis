import type { Sort } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { sortLabel } from "../../filters/labels";

export type TableFooterProps = {
	// The row count of the view.
	total: number;
	// The completed tickets the view leaves out: Done and Canceled under a
	// grouping other than status. The footer then names them.
	hidden?: number;
	// The URL sort.
	sort: Sort;
};

// The 28 px bar under the table. Its height never changes, so a count that
// arrives moves nothing above it. The bulk bar states the selected count,
// so the footer does not.
//
// TRL-36. The height is fixed, so neither span may wrap: a second line falls
// outside the bar and the bar cuts it, and the bar then paints over the last
// row. Below 640 px the sort label leaves the bar, which gives the count the
// whole width of a phone.
export function TableFooter({ total, hidden = 0, sort }: TableFooterProps) {
	return (
		<div
			data-table-footer=""
			data-list-footer=""
			className="flex h-7 shrink-0 items-center gap-4 px-5 text-xs text-fg-muted tabular"
		>
			<span className="whitespace-nowrap">
				{hidden > 0
					? `${formatCount(total)} open · ${formatCount(hidden)} completed hidden`
					: `${formatCount(total)} ${total === 1 ? "ticket" : "tickets"}`}
			</span>{" "}
			<span className="ml-auto hidden whitespace-nowrap sm:block">{sortLabel(sort)}</span>
		</div>
	);
}
