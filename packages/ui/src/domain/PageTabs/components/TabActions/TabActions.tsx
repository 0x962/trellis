import { DotsThree, PushPinSimple, PushPinSlash } from "@phosphor-icons/react";
import { IconButton } from "../../../../primitives/IconButton";
import { Menu, type MenuGroup, type MenuItem } from "../../../../primitives/Menu";
import type { PageTabGroupItem, PageTabItem, PageTabsProps } from "../../PageTabs";

type Props = {
	tabs: readonly PageTabItem[];
	groups: readonly PageTabGroupItem[];
	activeIndex: number;
	// The first and the last index of the region of the active tab: the
	// pinned tabs, its group, or the ungrouped tail. A move stays inside
	// that range.
	regionStart: number;
	regionEnd: number;
	onMove: PageTabsProps["onMove"];
	onPin: PageTabsProps["onPin"];
	onRename?: () => void;
	onRestore?: () => void;
	onCreateGroup?: () => void;
	onSetGroup?: (groupId: string | null) => void;
	currentGroupId: string | null;
	onSort: PageTabsProps["onSort"];
	onClose: () => void;
};
export function TabActions({
	tabs,
	groups,
	activeIndex,
	regionStart,
	regionEnd,
	onMove,
	onPin,
	onSort,
	onRename,
	onRestore,
	onCreateGroup,
	onSetGroup,
	currentGroupId,
	onClose,
}: Props) {
	const tab = tabs[activeIndex]!;
	const items: MenuItem[] = [];
	if (onPin)
		items.push(
			tab.pinned
				? { label: "Unpin tab", icon: <PushPinSlash />, onSelect: () => onPin(tab.id, false) }
				: { label: "Pin tab", icon: <PushPinSimple />, onSelect: () => onPin(tab.id, true) },
		);
	if (onRename && onRestore)
		items.push({ label: "Rename tab", onSelect: onRename }, { label: "Restore page title", onSelect: onRestore });
	if (onMove)
		items.push(
			{
				label: "Move tab left",
				kbd: "Alt+Shift+Left",
				disabled: activeIndex === regionStart,
				onSelect: () => onMove(tab.id, tabs[activeIndex - 1]!.id),
			},
			{
				label: "Move tab right",
				kbd: "Alt+Shift+Right",
				disabled: activeIndex === regionEnd,
				onSelect: () => onMove(tab.id, tabs[activeIndex + 2]?.id ?? null),
			},
			{
				label: "Move tab to start",
				kbd: "Alt+Shift+Home",
				disabled: activeIndex === regionStart,
				onSelect: () => onMove(tab.id, tabs[regionStart]!.id),
			},
			{
				label: "Move tab to end",
				kbd: "Alt+Shift+End",
				disabled: activeIndex === regionEnd,
				onSelect: () => onMove(tab.id, tabs[regionEnd + 1]?.id ?? null),
			},
		);
	if (onSort)
		items.push(
			{ label: "Sort tabs A to Z", disabled: tabs.length < 2, onSelect: () => onSort("ascending") },
			{ label: "Sort tabs Z to A", disabled: tabs.length < 2, onSelect: () => onSort("descending") },
		);
	items.push({ label: "Close tab", kbd: "Delete", onSelect: onClose });
	// A pinned tab belongs to no group, so it takes no group action.
	const groupItems: MenuItem[] = [];
	if (!tab.pinned) {
		if (onCreateGroup) groupItems.push({ label: "Add tab to new group", onSelect: onCreateGroup });
		if (onSetGroup) {
			for (const group of groups)
				if (group.id !== currentGroupId)
					groupItems.push({ id: group.id, label: `Move tab to ${group.name}`, onSelect: () => onSetGroup(group.id) });
			if (currentGroupId !== null)
				groupItems.push({ label: "Remove tab from group", onSelect: () => onSetGroup(null) });
		}
	}
	const menuGroups: MenuGroup[] = [{ type: "group", items }];
	if (groupItems.length > 0) menuGroups.push({ type: "group", label: "Group", items: groupItems });
	return (
		<Menu
			label="Tab actions"
			triggerTooltip="Tab actions"
			trigger={<IconButton label="Tab actions" icon={<DotsThree />} className="max-sm:h-11 max-sm:min-w-11" />}
			items={menuGroups}
		/>
	);
}
