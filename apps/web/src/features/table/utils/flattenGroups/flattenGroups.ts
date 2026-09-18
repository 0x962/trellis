import type { TicketSummary } from "@trellis/api";
import type { RowGroup } from "../groupRows";

// A group as the table renders it: the rows it holds and, for a closed
// group, the paging it owns.
export type TableGroup = RowGroup & {
	// The count the header shows. A closed group counts the server's rows,
	// loaded or not.
	count: number;
	// The text the count slot prints in place of `count`, such as the `3/11`
	// done and total counts of a milestone.
	countLabel?: string;
	expanded: boolean;
	// A closed group has more pages on the server.
	hasMore?: boolean;
	loadMore?: () => void;
	loading?: boolean;
};

// One line of the virtual list.
export type TableItem =
	| { kind: "header"; key: string; group: TableGroup }
	| { kind: "row"; key: string; group: TableGroup; ticket: TicketSummary }
	| { kind: "more"; key: string; group: TableGroup };

// The lines in order: each group's header, its rows while it is expanded,
// and its "show more" line while a page waits on the server.
export const flattenGroups = (groups: readonly TableGroup[]): TableItem[] => {
	const items: TableItem[] = [];
	for (const group of groups) {
		if (group.label !== null) items.push({ kind: "header", key: `header:${group.key}`, group });
		if (!group.expanded) continue;
		for (const ticket of group.rows) items.push({ kind: "row", key: ticket.id, group, ticket });
		if (group.hasMore) items.push({ kind: "more", key: `more:${group.key}`, group });
	}
	return items;
};
