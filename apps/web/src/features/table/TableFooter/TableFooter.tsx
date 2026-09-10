import type { Sort } from "@trellis/api";

export type TableFooterProps = {
	// The row count of the view.
	total: number;
	selected: number;
	// The URL sort. The default sort reads as priority, then updated.
	sort: Sort;
};

// Skeleton for the web-table work item. The tests beside it state the outcomes.
export function TableFooter(_props: TableFooterProps) {
	return null;
}
