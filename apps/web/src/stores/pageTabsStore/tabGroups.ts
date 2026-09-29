import type { PageTab, PageTabGroup } from "./types";

// The region of a tab in the strip order: "pinned" for a pinned tab, the
// group id of a grouped tab, or "" for the ungrouped tail. Two tabs trade
// places only inside one region. Pin, unpin, and the group actions are the
// only crossings.
export const pageTabRegion = (tab: PageTab): string => (tab.pinned ? "pinned" : (tab.groupId ?? ""));

// The index where the ungrouped tail starts.
export const tailStart = (tabs: readonly PageTab[]) => {
	const index = tabs.findIndex((item) => pageTabRegion(item) === "");
	return index === -1 ? tabs.length : index;
};

// The index after the last tab of a group. A group with no tab has its
// block after the pinned tabs and the blocks of the groups before it in
// `groups`.
export const groupEnd = (tabs: readonly PageTab[], groups: readonly PageTabGroup[], groupId: string) => {
	const last = tabs.findLastIndex((item) => item.groupId === groupId);
	if (last !== -1) return last + 1;
	const order = groups.findIndex((group) => group.id === groupId);
	const before = new Set(groups.slice(0, order).map((group) => group.id));
	return tabs.filter((item) => item.pinned || (item.groupId !== undefined && before.has(item.groupId))).length;
};

// The index where `tab` enters `tabs`, as close to `wanted` as its region
// allows. `tabs` holds no copy of `tab`.
export const insertIndex = (
	tabs: readonly PageTab[],
	groups: readonly PageTabGroup[],
	tab: PageTab,
	wanted: number,
) => {
	const region = pageTabRegion(tab);
	const first = tabs.findIndex((item) => pageTabRegion(item) === region);
	if (first !== -1)
		return Math.max(first, Math.min(tabs.findLastIndex((item) => pageTabRegion(item) === region) + 1, wanted));
	if (region === "pinned") return 0;
	return region === "" ? tabs.length : groupEnd(tabs, groups, region);
};

// Selecting a tab of a collapsed group expands that group, so the selected
// tab is always visible in the strip.
export const expandGroupOf = (groups: readonly PageTabGroup[], tab: PageTab) =>
	groups.map((group) => (group.id === tab.groupId && group.collapsed ? { ...group, collapsed: false } : group));

// Removes the group identified by `departedGroupId` only when it has no tab.
// Every other group stays, with or without tabs.
export const removeGroupIfEmpty = (
	tabs: readonly PageTab[],
	groups: readonly PageTabGroup[],
	departedGroupId: string | undefined,
) => groups.filter((group) => group.id !== departedGroupId || tabs.some((item) => item.groupId === group.id));
