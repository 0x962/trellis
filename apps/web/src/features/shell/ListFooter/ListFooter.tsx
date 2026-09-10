import { formatCount } from "../../../lib/format";

export type ListFooterProps = {
	// The row count of the list, or undefined before it arrives.
	total: number | undefined;
	// The active sort, as text: "Sorted by updated".
	sort: string;
};

// The 28 px bar under a list. Its height never changes, so the count
// arriving moves nothing above it.
export function ListFooter({ total, sort }: ListFooterProps) {
	return (
		<div
			data-list-footer=""
			className="flex h-7 shrink-0 items-center gap-4 border-t border-border px-5 text-xs text-fg-faint tabular"
		>
			<span>{total === undefined ? "" : `${formatCount(total)} ${total === 1 ? "ticket" : "tickets"}`}</span>
			<span className="ml-auto">{sort}</span>
		</div>
	);
}
