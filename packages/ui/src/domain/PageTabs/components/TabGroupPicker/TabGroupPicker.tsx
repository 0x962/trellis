import { FolderSimple, Plus } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { Command } from "../../../../primitives/Command";
import { IconButton } from "../../../../primitives/IconButton";
import { Popover } from "../../../../primitives/Popover";
import type { PageTabGroupItem } from "../../PageTabs";

type Props = {
	// The groups the active tab can move to: every group but its own.
	groups: readonly PageTabGroupItem[];
	groupNames: readonly string[];
	onCreate?: (name: string) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (groupId: string) => void;
};

// The list of groups the active tab can move to. A virtual list holds it,
// so a strip with many groups opens as fast as a strip with two.
export function TabGroupPicker({ groups, groupNames, onCreate, open, onOpenChange, onSelect }: Props) {
	const [search, setSearch] = useState("");
	const name = search.trim();
	const canCreate =
		onCreate && name !== "" && !groupNames.some((existing) => existing.toLowerCase() === name.toLowerCase());
	const input = useRef<HTMLInputElement>(null);
	const items = useMemo(() => groups.map((group) => ({ id: group.id, label: group.name })), [groups]);
	return (
		<Popover
			label="Move tab to a group"
			align="end"
			open={open}
			initialFocus={input}
			onOpenChange={(next) => {
				if (!next) setSearch("");
				onOpenChange(next);
			}}
			triggerTooltip="Move tab to a group"
			trigger={
				<IconButton label="Move tab to a group" icon={<FolderSimple />} className="max-sm:h-11 max-sm:min-w-11" />
			}
			className="w-80 max-w-[calc(100vw-var(--spacing)*4)] p-2"
		>
			{open && (
				<Command.Virtual
					items={
						canCreate
							? [...items, { id: "create-group", label: `Create group "${name}"`, icon: <Plus />, pinned: true }]
							: items
					}
					onSearchChange={setSearch}
					onSelect={(id) => {
						if (id === "create-group" && canCreate) onCreate(name);
						else onSelect(id);
						setSearch("");
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
