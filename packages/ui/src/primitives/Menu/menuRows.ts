import type { KeyboardEvent, ReactElement } from "react";

export type MenuItem = {
	type?: "item";
	// The identity of the item in its group, for two items that carry the same
	// words but are not the same item. The label is the identity when this is
	// absent.
	id?: string;
	label: string;
	onSelect: () => void;
	// An icon element, shown at 14 px before the label.
	icon?: ReactElement;
	// A second line under the label, for a detail of the thing the item names.
	detail?: string;
	// `warning` draws the second line in the warning color, for a detail the
	// reader must see before the item runs.
	detailTone?: "muted" | "warning";
	// The key that runs the item, shown as a Kbd. A key of one character also
	// runs the item while the menu is open.
	kbd?: string;
	disabled?: boolean;
	// A danger item is red: delete, cancel.
	danger?: boolean;
	// The state of one choice of a set, such as the page a menu of pages is
	// on. A row that carries this field reports its state to a screen reader
	// and draws a check while the value is true. An item that runs an action
	// carries no state and leaves this field out.
	checked?: boolean;
};

export type MenuGroup = {
	type: "group";
	label?: string;
	items: readonly MenuItem[];
};

const isMenuGroup = (item: MenuItem | MenuGroup): item is MenuGroup => item.type === "group";

// The groups a menu draws: the caller's own groups, or one group that holds
// a flat list of items. A group that holds no item draws nothing.
export const menuGroups = (items: readonly MenuItem[] | readonly MenuGroup[]): readonly MenuGroup[] => {
	const groups = items.length > 0 && items.every(isMenuGroup) ? items : [{ type: "group", items } as MenuGroup];
	return groups.filter((group) => group.items.length > 0);
};

// True for a row that reports a state, such as the page a menu of pages is
// on. Such a row draws as a checkbox item, which carries the state to a
// screen reader. Every other row is an action and draws as a plain item.
export const isCheckableItem = (item: MenuItem): boolean => item.checked !== undefined;

// The item that one key press runs while the menu is open. The key matches
// the `kbd` of an item of one character, such as the 1 of the first item. A
// press that carries a modifier belongs to the browser or the operating
// system, so it runs no item, and a disabled item takes no press.
export const itemForKey = (groups: readonly MenuGroup[], event: KeyboardEvent): MenuItem | undefined => {
	if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key.length !== 1) return undefined;
	const key = event.key.toLowerCase();
	return groups
		.flatMap((group) => group.items)
		.find((item) => item.disabled !== true && item.kbd?.length === 1 && item.kbd.toLowerCase() === key);
};
