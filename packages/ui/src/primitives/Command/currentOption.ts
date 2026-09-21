import type { CommandGroup, CommandItem } from "./Command";

// The id of the option a list opens on: the current option, or the first
// checked option of a multi-value list, in display order. The plain items
// come before the groups, the same order `Command` draws them in.
export const currentOption = (items: readonly CommandItem[], groups: readonly CommandGroup[]): string | undefined =>
	[...items, ...groups.flatMap((group) => group.items)].find((item) => item.current === true || item.checked === true)
		?.id;
