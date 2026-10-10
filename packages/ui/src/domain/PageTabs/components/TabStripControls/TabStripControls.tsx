import { Plus } from "@phosphor-icons/react";
import type { RefObject } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import type { PageTabGroupItem, PageTabItem } from "../../PageTabs";
import { TabGroupPicker } from "../TabGroupPicker";
import { TabPicker } from "../TabPicker";

type Props = {
	tabs: readonly PageTabItem[];
	activeId: string;
	otherGroups: readonly PageTabGroupItem[];
	groupNames: readonly string[];
	onGroupCreate?: (name: string) => void;
	canPickGroup: boolean;
	groupPickerOpen: boolean;
	onGroupPickerOpenChange: (open: boolean) => void;
	// The Add button takes focus when the strip has no tab to focus.
	addButton: RefObject<HTMLButtonElement | null>;
	onAdd: () => void;
	onSelect: (id: string) => void;
	onGroupSelect: (groupId: string) => void;
};

// The strip keeps Add tab, the tab picker, and the group picker together.
export function TabStripControls({
	tabs,
	activeId,
	otherGroups,
	groupNames,
	onGroupCreate,
	canPickGroup,
	groupPickerOpen,
	onGroupPickerOpenChange,
	addButton,
	onAdd,
	onSelect,
	onGroupSelect,
}: Props) {
	return (
		<div className="relative flex h-8 shrink-0 items-center gap-0.5 px-0.5 max-sm:h-11 pointer-coarse:h-11">
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
					groupNames={groupNames}
					onCreate={onGroupCreate}
					open={groupPickerOpen}
					onOpenChange={onGroupPickerOpenChange}
					onSelect={onGroupSelect}
				/>
			)}
		</div>
	);
}
