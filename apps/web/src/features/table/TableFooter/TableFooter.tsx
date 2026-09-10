import type { Sort } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { sortLabel } from "../../filters/labels";

export type TableFooterProps = {
	// The row count of the view.
	total: number;
	// The completed tickets the view leaves out: Done and Canceled under a
	// grouping other than status. The footer then names them.
	hidden?: number;
	// The URL sort. The default sort reads as priority, then updated.
	sort: Sort;
};

// The 28 px bar under the table. Its height never changes, so a count that
// arrives moves nothing above it. The bulk bar states the selected count,
// so the footer does not.
export function TableFooter({ total, hidden = 0, sort }: TableFooterProps) {
	return (
		<div
			data-table-footer=""
			data-list-footer=""
			className="flex h-7 shrink-0 items-center gap-4 border-t border-border px-5 text-xs text-fg-muted tabular"
		>
			<span>
				{hidden > 0
					? `${formatCount(total)} open · ${formatCount(hidden)} completed hidden`
					: `${formatCount(total)} ${total === 1 ? "ticket" : "tickets"}`}
			</span>{" "}
			<span className="ml-auto">{sortLabel(sort)}</span>
		</div>
	);
}
