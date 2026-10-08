import type { MenuGroup, MenuItem } from "@trellis/ui";
import { useMemo } from "react";
import { useStoryState } from "../useStoryState";

export function useMenuItems(items: readonly MenuItem[] | readonly MenuGroup[]) {
	const initialGroups = useMemo<readonly MenuGroup[]>(
		() =>
			items.every((item) => item.type === "group") ? items : [{ type: "group", items: items as readonly MenuItem[] }],
		[items],
	);
	const [groups, setGroups] = useStoryState(initialGroups);
	return groups.map((group, groupIndex) => ({
		...group,
		items: group.items.map((item, itemIndex) => ({
			...item,
			onSelect: (press: Parameters<MenuItem["onSelect"]>[0]) => {
				item.onSelect(press);
				if (item.checked === undefined) return;
				setGroups(
					groups.map((entry, index) =>
						index === groupIndex
							? {
									...entry,
									items: entry.items.map((value, index) =>
										index === itemIndex ? { ...value, checked: !value.checked } : value,
									),
								}
							: entry,
					),
				);
			},
		})),
	}));
}
