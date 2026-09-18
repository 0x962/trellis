import type { FlowRunRow } from "./types";

// The rows to draw: every row whose ancestors are all expanded. `rows` is in
// display order, so a parent always comes before its descendants.
export function visibleRows(rows: readonly FlowRunRow[], collapsed: ReadonlySet<string>): FlowRunRow[] {
	const hidden = new Set<string>();
	const visible: FlowRunRow[] = [];
	for (const row of rows) {
		if (row.parentKey !== null && (collapsed.has(row.parentKey) || hidden.has(row.parentKey))) {
			hidden.add(row.key);
			continue;
		}
		visible.push(row);
	}
	return visible;
}
