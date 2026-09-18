import type { TicketSummary } from "@trellis/api";
import type { TableItem } from "../flattenGroups";

// The tickets a person can see, in display order. `flattenGroups` drops the
// rows of a collapsed group, so this list drops them too.
//
// The selection, the roving focus, and the ranges of shift+j all run over
// this list. A row a person cannot see therefore never joins a selection,
// never takes the focus, and never sits inside a range.
export const visibleRows = (items: readonly TableItem[]): TicketSummary[] =>
	items.flatMap((item) => (item.kind === "row" ? [item.ticket] : []));
