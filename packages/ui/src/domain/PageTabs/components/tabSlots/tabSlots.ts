import type { PageTabGroupItem, PageTabItem } from "../../PageTabs";

// One box of the unpinned strip. A tab takes one box, and a group header
// takes one box before the tabs of its group. A collapsed group shows its
// header alone.
export type TabSlot =
	| { kind: "tab"; tab: PageTabItem; tabIndex: number }
	| { kind: "group"; group: PageTabGroupItem; count: number };

// The boxes of the unpinned strip in order. `tabs` holds the unpinned tabs:
// the blocks of the groups in `groups` order, then the ungrouped tail, so
// each header goes before the first tab of its group. `offset` is the index
// of the first of these tabs among all tabs, so `tabIndex` addresses the
// whole list.
export const tabSlots = (tabs: readonly PageTabItem[], groups: readonly PageTabGroupItem[], offset = 0): TabSlot[] => {
	const slots: TabSlot[] = [];
	const seen = new Set<string>();
	tabs.forEach((tab, index) => {
		const group = tab.groupId === undefined ? undefined : groups.find((item) => item.id === tab.groupId)!;
		if (group && !seen.has(group.id)) {
			seen.add(group.id);
			slots.push({ kind: "group", group, count: tabs.filter((item) => item.groupId === group.id).length });
		}
		if (!group?.collapsed) slots.push({ kind: "tab", tab, tabIndex: offset + index });
	});
	return slots;
};

// The tab that a drop before slot `index` lands before. A drop on a header
// lands before the first tab of that group. A drop after the last slot is
// null, the end of the strip.
export const dropTargetId = (slots: readonly TabSlot[], index: number): string | null => {
	for (const slot of slots.slice(index)) if (slot.kind === "tab") return slot.tab.id;
	return null;
};

// The slot index of a tab, or -1 for a tab hidden in a collapsed group or
// outside the unpinned strip.
export const slotIndexOf = (slots: readonly TabSlot[], tabId: string) =>
	slots.findIndex((slot) => slot.kind === "tab" && slot.tab.id === tabId);
