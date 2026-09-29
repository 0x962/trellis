import { DotsThree } from "@phosphor-icons/react";
import { type CSSProperties, useLayoutEffect, useRef } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { InlineEdit } from "../../../../primitives/InlineEdit";
import { Menu, type MenuItem } from "../../../../primitives/Menu";
import { GroupHeader } from "../../../GroupHeader";
import type { PageTabGroupItem, PageTabsProps } from "../../PageTabs";

type Props = {
	group: PageTabGroupItem;
	count: number;
	style: CSSProperties;
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
	onRename: PageTabsProps["onRenameGroup"];
	onRemove: PageTabsProps["onRemoveGroup"];
	onCollapse: NonNullable<PageTabsProps["onGroupCollapse"]>;
};

// The box before the tabs of a group: the shared GroupHeader in its strip
// appearance, with the name field of a rename and the group menu.
export function TabGroupHeader({
	group,
	count,
	style,
	editing,
	onEditingChange,
	onRename,
	onRemove,
	onCollapse,
}: Props) {
	const box = useRef<HTMLDivElement>(null);
	// Enter and Escape end the edit and give the focus to the collapse button,
	// which draws the name at rest. The button mounts after the field closes,
	// so the focus waits for that render.
	const focusToggle = useRef(false);
	useLayoutEffect(() => {
		if (editing || !focusToggle.current) return;
		focusToggle.current = false;
		box.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
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
			ref={box}
			role="presentation"
			data-page-tab-group={group.id}
			className="absolute top-0 left-0 h-9 text-fg-muted max-sm:h-11 pointer-coarse:h-11"
			style={style}
		>
			<GroupHeader
				group={group.id}
				label={group.name}
				count={count}
				expanded={!group.collapsed}
				onToggle={() => onCollapse(group.id, !group.collapsed)}
				appearance="strip"
				labelField={
					editing ? (
						<InlineEdit
							label="Group name"
							value={group.name}
							editing
							onEditingChange={(_, focus) => {
								focusToggle.current = focus === "value";
								onEditingChange(false);
							}}
							onSave={async (name) => onRename!(group.id, name)}
							className="min-w-0 flex-1"
							inputClassName="h-7 max-sm:h-11"
						/>
					) : undefined
				}
				actions={
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
				}
			/>
		</div>
	);
}
