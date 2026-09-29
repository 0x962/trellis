import { FolderSimple } from "@phosphor-icons/react";
import { useMemo, useRef } from "react";
import { Command } from "../../../../primitives/Command";
import { IconButton } from "../../../../primitives/IconButton";
import { Popover } from "../../../../primitives/Popover";
import type { PageTabGroupItem } from "../../PageTabs";

type Props = {
	// The groups the active tab can move to: every group but its own.
	groups: readonly PageTabGroupItem[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (groupId: string) => void;
};

// The list of groups the active tab can move to. A virtual list holds it,
// so a strip with many groups opens as fast as a strip with two.
export function TabGroupPicker({ groups, open, onOpenChange, onSelect }: Props) {
	const input = useRef<HTMLInputElement>(null);
	const items = useMemo(() => groups.map((group) => ({ id: group.id, label: group.name })), [groups]);
	return (
		<Popover
			label="Move tab to a group"
			align="end"
			open={open}
			initialFocus={input}
			onOpenChange={onOpenChange}
			triggerTooltip="Move tab to a group"
			trigger={
				<IconButton label="Move tab to a group" icon={<FolderSimple />} className="max-sm:h-11 max-sm:min-w-11" />
			}
			className="w-80 max-w-[calc(100vw-var(--spacing)*4)] p-2"
		>
			{open && (
				<Command.Virtual
					items={items}
					onSelect={(id) => {
						onSelect(id);
						onOpenChange(false);
					}}
					inputRef={input}
					label="Search groups"
					placeholder="Search groups…"
					empty="No groups match."
				/>
			)}
		</Popover>
	);
}
