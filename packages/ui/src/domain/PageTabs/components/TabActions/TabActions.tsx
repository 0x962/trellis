import { DotsThree } from "@phosphor-icons/react";
import { IconButton } from "../../../../primitives/IconButton";
import { Menu, type MenuItem } from "../../../../primitives/Menu";
import type { PageTabItem, PageTabsProps } from "../../PageTabs";

type Props = {
	tabs: readonly PageTabItem[];
	activeIndex: number;
	onMove: PageTabsProps["onMove"];
	onRename?: () => void;
	onRestore?: () => void;
	onClose: () => void;
};
export function TabActions({ tabs, activeIndex, onMove, onRename, onRestore, onClose }: Props) {
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
	return (
		<Menu
			label="Tab actions"
			triggerTooltip="Tab actions"
			trigger={<IconButton label="Tab actions" icon={<DotsThree />} className="max-sm:h-11 max-sm:min-w-11" />}
			items={items}
		/>
	);
}
