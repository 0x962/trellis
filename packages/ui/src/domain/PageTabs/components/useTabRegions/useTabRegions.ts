import { useMemo } from "react";
import type { PageTabGroupItem, PageTabItem } from "../../PageTabs";
import { slotIndexOf, tabSlots } from "../tabSlots";

// The region a tab moves inside: the pinned tabs, its group, or the
// ungrouped tail.
const regionOf = (tab: PageTabItem) => (tab.pinned ? "pinned" : (tab.groupId ?? ""));

// The places of the active tab in the strip: its index among all tabs, the
// bounds of its region, its slot in the unpinned strip, and the groups it
// can move to.
export function useTabRegions(tabs: readonly PageTabItem[], groups: readonly PageTabGroupItem[], activeId: string) {
	const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
	const pinnedCount = tabs.filter((tab) => tab.pinned).length;
	const activeTab = activeIndex >= 0 ? tabs[activeIndex] : undefined;
	const activeRegion = activeTab === undefined ? "" : regionOf(activeTab);
	const activeGroupId = activeTab?.groupId ?? null;
	const slots = useMemo(() => tabSlots(tabs.slice(pinnedCount), groups, pinnedCount), [tabs, pinnedCount, groups]);
	const otherGroups = useMemo(() => groups.filter((group) => group.id !== activeGroupId), [groups, activeGroupId]);
	return {
		activeIndex,
		activeTab,
		activeGroupId,
		pinnedCount,
		activePinned: activeIndex >= 0 && activeIndex < pinnedCount,
		regionStart: tabs.findIndex((tab) => regionOf(tab) === activeRegion),
		regionEnd: tabs.findLastIndex((tab) => regionOf(tab) === activeRegion),
		slots,
		activeSlot: slotIndexOf(slots, activeId),
		otherGroups,
	};
}
