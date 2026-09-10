import type { Sort } from "@trellis/api";
import { formatCount } from "../../../lib/format";
import { sortLabel } from "../../filters/labels";

export type TableFooterProps = {
	// The row count of the view.
	total: number;
	// The URL sort. The default sort reads as priority, then updated.
	sort: Sort;
};

// The 28 px bar under the table. Its height never changes, so a count that
// arrives moves nothing above it. The bulk bar states the selected count,
// so the footer does not.
export function TableFooter({ total, sort }: TableFooterProps) {
	return (
		<div
			data-table-footer=""
			data-list-footer=""
			className="flex h-7 shrink-0 items-center gap-4 border-t border-border px-5 text-xs text-fg-faint tabular"
		>
			<span>
				{formatCount(total)} {total === 1 ? "ticket" : "tickets"}
			</span>{" "}
			<span className="ml-auto">{sortLabel(sort)}</span>
		</div>
	);
}
