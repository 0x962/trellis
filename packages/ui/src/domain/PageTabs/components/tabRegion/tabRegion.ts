import type { PageTabItem } from "../../PageTabs";

const regionOf = (tab: PageTabItem) => (tab.pinned ? "pinned" : (tab.groupId ?? ""));

// A move stays inside the pinned region, one group, or the ungrouped tail.
export function tabRegion(tabs: readonly PageTabItem[], id: string) {
	const activeIndex = tabs.findIndex((tab) => tab.id === id);
	const activeTab = tabs[activeIndex];
	const region = activeTab === undefined ? "" : regionOf(activeTab);
	return {
		activeIndex,
		activeTab,
		activeGroupId: activeTab?.groupId ?? null,
		regionStart: tabs.findIndex((tab) => regionOf(tab) === region),
		regionEnd: tabs.findLastIndex((tab) => regionOf(tab) === region),
	};
}
