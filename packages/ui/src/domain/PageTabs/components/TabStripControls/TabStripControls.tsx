import { Plus } from "@phosphor-icons/react";
import type { RefObject } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import type { PageTabGroupItem, PageTabItem, PageTabSortDirection } from "../../PageTabs";
import { TabActions } from "../TabActions";
import { TabGroupPicker } from "../TabGroupPicker";
import { TabPicker } from "../TabPicker";

type Props = {
	tabs: readonly PageTabItem[];
	activeId: string;
	activeIndex: number;
	regionStart: number;
	regionEnd: number;
	// The groups the active tab can move to.
	otherGroups: readonly PageTabGroupItem[];
	// Present when the active tab can leave its group.
	activeGroupId: string | null;
	canPickGroup: boolean;
	groupPickerOpen: boolean;
	onGroupPickerOpenChange: (open: boolean) => void;
	// The Add button takes focus when the strip has no tab to focus.
	addButton: RefObject<HTMLButtonElement | null>;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onMove?: (id: string, beforeId: string | null) => void;
	onSort?: (direction: PageTabSortDirection) => void;
	onPin?: (id: string, pinned: boolean) => void;
	onRename?: () => void;
	onRestore?: () => void;
	onCreateGroup?: () => void;
	onSetTabGroup?: (tabId: string, groupId: string | null) => void;
	onClose: () => void;
};

// The controls at the end of the strip: Add tab, the tab picker, the group
// picker, and the menu of the active tab.
export function TabStripControls({
	tabs,
	activeId,
	activeIndex,
	regionStart,
	regionEnd,
	otherGroups,
	activeGroupId,
	canPickGroup,
	groupPickerOpen,
	onGroupPickerOpenChange,
	addButton,
	onAdd,
	onSelect,
	onMove,
	onSort,
	onPin,
	onRename,
	onRestore,
	onCreateGroup,
	onSetTabGroup,
	onClose,
}: Props) {
	return (
		<div className="relative flex h-9 shrink-0 items-center gap-1 px-1 max-sm:h-11 pointer-coarse:h-11">
			<Tooltip content="Add tab">
				<IconButton
					ref={addButton}
					label="Add tab"
					icon={<Plus />}
					onClick={onAdd}
					className="max-sm:h-11 max-sm:min-w-11"
				/>
			</Tooltip>
			<TabPicker tabs={tabs} activeId={activeId} onSelect={onSelect} />
			{canPickGroup && (
				<TabGroupPicker
					groups={otherGroups}
					open={groupPickerOpen}
					onOpenChange={onGroupPickerOpenChange}
					onSelect={(groupId) => onSetTabGroup!(activeId, groupId)}
				/>
			)}
			{tabs.length > 0 && (onMove || onRename || onPin || onSort || onSetTabGroup) && (
				<TabActions
					tabs={tabs}
					activeIndex={activeIndex}
					regionStart={regionStart}
					regionEnd={regionEnd}
					onMove={onMove}
					onSort={onSort}
					onPin={onPin}
					onRename={onRename}
					onRestore={onRestore}
					onCreateGroup={onCreateGroup}
					onPickGroup={canPickGroup ? () => onGroupPickerOpenChange(true) : undefined}
					onLeaveGroup={onSetTabGroup && activeGroupId !== null ? () => onSetTabGroup(activeId, null) : undefined}
					onClose={onClose}
				/>
			)}
		</div>
	);
}
