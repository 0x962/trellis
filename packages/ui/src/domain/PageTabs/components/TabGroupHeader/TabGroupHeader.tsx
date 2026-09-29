import { CaretDown, CaretRight, DotsThree } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { InlineEdit } from "../../../../primitives/InlineEdit";
import { Menu, type MenuItem } from "../../../../primitives/Menu";
import { cx } from "../../../../utils/cx";
import type { PageTabGroupItem, PageTabsProps } from "../../PageTabs";

type Props = {
	group: PageTabGroupItem;
	count: number;
	index: number;
	width: number;
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
	onRename: PageTabsProps["onRenameGroup"];
	onRemove: PageTabsProps["onRemoveGroup"];
	onCollapse: NonNullable<PageTabsProps["onGroupCollapse"]>;
};

// The box before the tabs of a group. Its collapse button names the group
// and shows the tab count. The wave header of a ticket list works the same
// way, so a person meets one disclosure everywhere.
export function TabGroupHeader({
	group,
	count,
	index,
	width,
	editing,
	onEditingChange,
	onRename,
	onRemove,
	onCollapse,
}: Props) {
	const Chevron = group.collapsed ? CaretRight : CaretDown;
	const toggle = useRef<HTMLButtonElement>(null);
	// Enter and Escape end the edit and give the focus to the collapse button,
	// which draws the name at rest. The button mounts after the field closes,
	// so the focus waits for that render.
	const focusToggle = useRef(false);
	useLayoutEffect(() => {
		if (editing || !focusToggle.current) return;
		focusToggle.current = false;
		toggle.current?.focus({ preventScroll: true });
	}, [editing]);
	const items: MenuItem[] = [
		{
			label: group.collapsed ? "Expand group" : "Collapse group",
			onSelect: () => onCollapse(group.id, !group.collapsed),
		},
	];
	if (onRename) items.push({ label: "Rename group", onSelect: () => onEditingChange(true) });
	if (onRemove) items.push({ label: "Ungroup tabs", onSelect: () => onRemove(group.id) });
	return (
		<div
			role="presentation"
			data-page-tab-group={group.id}
			className="group/header absolute top-0 left-0 flex h-9 items-center gap-1 pr-1 pl-2 text-fg-muted max-sm:h-11 pointer-coarse:h-11"
			style={{ left: index * width, width }}
		>
			<InlineEdit
				label="Group name"
				value={group.name}
				editing={editing}
				onEditingChange={(_, focus) => {
					focusToggle.current = focus === "value";
					onEditingChange(false);
				}}
				onSave={async (name) => onRename!(group.id, name)}
				className="min-w-0 flex-1"
				inputClassName="h-7 max-sm:h-11"
			>
				<button
					ref={toggle}
					type="button"
					data-page-tab-group-toggle={group.id}
					aria-expanded={!group.collapsed}
					aria-label={`${group.name}, ${count} ${count === 1 ? "tab" : "tabs"}`}
					onClick={() => onCollapse(group.id, !group.collapsed)}
					className={cx(
						"flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-xs font-medium transition-colors duration-hover ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 max-sm:h-11 pointer-coarse:h-11",
						group.collapsed && "text-fg",
					)}
				>
					<Chevron aria-hidden="true" className="size-3 shrink-0 text-fg-faint" />
					<span className="min-w-0 flex-1 truncate">{group.name}</span>
					<span className="shrink-0 tabular-nums text-fg-faint">{count}</span>
				</button>
			</InlineEdit>
			{!editing && (
				<Menu
					label={`${group.name} actions`}
					triggerTooltip="Group actions"
					trigger={
						<IconButton
							label={`${group.name} actions`}
							icon={<DotsThree />}
							size="sm"
							className="max-sm:h-11 max-sm:min-w-11"
						/>
					}
					items={items}
				/>
			)}
		</div>
	);
}
