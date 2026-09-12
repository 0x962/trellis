import { formatCount } from "../../../lib/format";

export type ListFooterProps = {
	// The row count of the list, or undefined before it arrives.
	total: number | undefined;
	// The active sort, as text: "Sorted by updated".
	sort: string;
};

// The 28 px bar under a list. Its height never changes, so the count
// arriving moves nothing above it.
//
// TRL-36. The board's bar is the table's bar, so it takes the same rule:
// neither span may wrap inside a fixed height, and the sort label leaves the
// bar below 640 px.
export function ListFooter({ total, sort }: ListFooterProps) {
	return (
		<div data-list-footer="" className="flex h-7 shrink-0 items-center gap-4 px-5 text-xs text-fg-muted tabular">
			<span className="whitespace-nowrap">
				{total === undefined ? "" : `${formatCount(total)} ${total === 1 ? "ticket" : "tickets"}`}
			</span>
			<span className="ml-auto hidden whitespace-nowrap sm:block">{sort}</span>
		</div>
	);
}
