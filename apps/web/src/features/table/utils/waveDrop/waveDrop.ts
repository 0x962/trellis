import type { TableGroup, TableItem } from "../flattenGroups";

// The ticket ids that a drag of one row carries: the whole selection when
// the row is selected, else the row alone.
export const draggedIds = (id: string, selected: readonly string[]): string[] =>
	selected.includes(id) ? [...selected] : [id];

// The group that a drag over the line of `key` drops into, or null. Only a
// wave group of a table of one epic takes a drop, and the No wave group
// clears the wave. A group that already holds every dragged ticket takes
// no drop, because the drop would change nothing.
export const dropGroup = (
	items: readonly TableItem[],
	key: string,
	ticketIds: readonly string[],
): TableGroup | null => {
	const group = items.find((item) => item.group.key === key)?.group;
	if (group === undefined || group.epicRef === undefined) return null;
	const held = new Set(group.rows.map((row) => row.id));
	return ticketIds.every((id) => held.has(id)) ? null : group;
};

// The first and the last line index of a group, for the drop outline.
export const groupSpan = (items: readonly TableItem[], key: string): { first: number; last: number } | null => {
	const first = items.findIndex((item) => item.group.key === key);
	if (first === -1) return null;
	let last = first;
	while (items[last + 1]?.group.key === key) last += 1;
	return { first, last };
};
