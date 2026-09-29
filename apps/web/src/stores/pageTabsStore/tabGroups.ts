import type { PageTab, PageTabGroup } from "./pageTabsStore";

// The region key of a tab in the strip order: its group id, or "" for the
// ungrouped tail. Two tabs share a region when they can trade places.
export const pageTabRegion = (tab: PageTab): string => tab.groupId ?? "";

// The index where the ungrouped tail starts.
export const tailStart = (tabs: readonly PageTab[]) => {
	const index = tabs.findIndex((item) => item.groupId === undefined);
	return index === -1 ? tabs.length : index;
};

// The index after the last tab of a group. A group with no tab has its
// block after the blocks of the groups before it in `groups`.
export const groupEnd = (tabs: readonly PageTab[], groups: readonly PageTabGroup[], groupId: string) => {
	const last = tabs.findLastIndex((item) => item.groupId === groupId);
	if (last !== -1) return last + 1;
	const order = groups.findIndex((group) => group.id === groupId);
	return groups
		.slice(0, order)
		.reduce((count, group) => count + tabs.filter((item) => item.groupId === group.id).length, 0);
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
	return tab.groupId === undefined ? tabs.length : groupEnd(tabs, groups, tab.groupId);
};

// Selecting a tab of a collapsed group expands that group, so the selected
// tab is always visible in the strip.
export const expandGroupOf = (groups: readonly PageTabGroup[], tab: PageTab) =>
	groups.map((group) => (group.id === tab.groupId && group.collapsed ? { ...group, collapsed: false } : group));
