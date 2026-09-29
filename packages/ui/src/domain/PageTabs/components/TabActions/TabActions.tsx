import { DotsThree } from "@phosphor-icons/react";
import { IconButton } from "../../../../primitives/IconButton";
import { Menu, type MenuGroup, type MenuItem } from "../../../../primitives/Menu";
import type { PageTabGroupItem, PageTabItem, PageTabsProps } from "../../PageTabs";

type Props = {
	tabs: readonly PageTabItem[];
	groups: readonly PageTabGroupItem[];
	activeIndex: number;
	onMove: PageTabsProps["onMove"];
	onRename?: () => void;
	onRestore?: () => void;
	onCreateGroup?: () => void;
	onSetGroup?: (groupId: string | null) => void;
	currentGroupId: string | null;
	onClose: () => void;
};
export function TabActions({
	tabs,
	groups,
	activeIndex,
	onMove,
	onRename,
	onRestore,
	onCreateGroup,
	onSetGroup,
	currentGroupId,
	onClose,
}: Props) {
	const id = tabs[activeIndex]!.id;
	const items: MenuItem[] = [];
	if (onRename && onRestore)
		items.push({ label: "Rename tab", onSelect: onRename }, { label: "Restore page title", onSelect: onRestore });
	if (onMove)
		items.push(
			{
				label: "Move tab left",
				kbd: "Alt+Shift+Left",
				disabled: activeIndex === 0,
				onSelect: () => onMove(id, tabs[activeIndex - 1]!.id),
			},
			{
				label: "Move tab right",
				kbd: "Alt+Shift+Right",
				disabled: activeIndex === tabs.length - 1,
				onSelect: () => onMove(id, tabs[activeIndex + 2]?.id ?? null),
			},
			{
				label: "Move tab to start",
				kbd: "Alt+Shift+Home",
				disabled: activeIndex === 0,
				onSelect: () => onMove(id, tabs[0]!.id),
			},
			{
				label: "Move tab to end",
				kbd: "Alt+Shift+End",
				disabled: activeIndex === tabs.length - 1,
				onSelect: () => onMove(id, null),
			},
		);
	items.push({ label: "Close tab", kbd: "Delete", onSelect: onClose });
	const groupItems: MenuItem[] = [];
	if (onCreateGroup) groupItems.push({ label: "Add tab to new group", onSelect: onCreateGroup });
	if (onSetGroup) {
		for (const group of groups)
			if (group.id !== currentGroupId)
				groupItems.push({ id: group.id, label: `Move tab to ${group.name}`, onSelect: () => onSetGroup(group.id) });
		if (currentGroupId !== null) groupItems.push({ label: "Remove tab from group", onSelect: () => onSetGroup(null) });
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
