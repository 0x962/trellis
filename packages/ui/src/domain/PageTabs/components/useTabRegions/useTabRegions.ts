import { useMemo } from "react";
import type { PageTabGroupItem, PageTabItem } from "../../PageTabs";
import { tabRegion } from "../tabRegion";
import { slotIndexOf, tabSlots } from "../tabSlots";

// The places of the active tab in the strip: its index among all tabs, the
// bounds of its region, and its slot in the unpinned strip.
export function useTabRegions(tabs: readonly PageTabItem[], groups: readonly PageTabGroupItem[], activeId: string) {
	const region = tabRegion(tabs, activeId);
	const { activeIndex } = region;
	const pinnedCount = tabs.filter((tab) => tab.pinned).length;
	const slots = useMemo(() => tabSlots(tabs.slice(pinnedCount), groups, pinnedCount), [tabs, pinnedCount, groups]);
	return {
		...region,
		pinnedCount,
		activePinned: activeIndex >= 0 && activeIndex < pinnedCount,
		slots,
		activeSlot: slotIndexOf(slots, activeId),
	};
}
