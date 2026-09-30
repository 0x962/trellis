import type { CommandGroup, CommandItem, CommandProps } from "@trellis/ui";
import { useState } from "react";
import { useStoryState } from "../useStoryState";

const noItems: CommandItem[] = [];
const noGroups: CommandGroup[] = [];

export function useCommandItems(args: Pick<CommandProps, "items" | "groups">) {
	const [items, setItems] = useStoryState(args.items ?? noItems);
	const [groups, setGroups] = useStoryState(args.groups ?? noGroups);
	const [selected, setSelected] = useState("");
	const onSelect = (id: string) => {
		const select = (item: CommandItem): CommandItem => ({
			...item,
			current: item.id === id,
			checked: item.id === id && item.checked !== undefined ? item.checked !== true : item.checked,
		});
		setItems(items.map(select));
		setGroups(groups.map((group) => ({ ...group, items: group.items.map(select) })));
		setSelected(id);
	};
	return { items, groups, selected, onSelect };
}
