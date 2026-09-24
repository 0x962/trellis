import { Menu as BaseMenu } from "@base-ui/react/menu";
import { DotsThree } from "@phosphor-icons/react";
import { type KeyboardEvent, type ReactElement, useState } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { popupMotion } from "../../utils/popupMotion";
import { Kbd } from "../Kbd";
import { Tooltip } from "../Tooltip";

export type MenuItem = {
	type?: "item";
	// The identity of the item among its group, where two items can carry the
	// same words: two stored agent choices of one harness and one model, for
	// example, that differ in the effort alone. The label is the identity
	// where this is absent.
	id?: string;
	label: string;
	onSelect: () => void;
	// An icon element, shown at 14 px before the label.
	icon?: ReactElement;
	// A second line under the label, for the detail of the thing the item
	// names, such as the effort and the account of a stored agent choice.
	detail?: string;
	// `warning` draws the second line in the warning color, for a detail the
	// reader must see before the item runs, such as a model the harness no
	// longer serves.
	detailTone?: "muted" | "warning";
	// The key that runs the item, shown as a Kbd. A key of one character also
	// runs the item while the menu is open.
	kbd?: string;
	disabled?: boolean;
	// A danger item is red: delete, cancel.
	danger?: boolean;
};

export type MenuGroup = {
	type: "group";
	label?: string;
	items: readonly MenuItem[];
};

export type MenuProps = {
	// The accessible name of the trigger.
	label: string;
	items: readonly MenuItem[] | readonly MenuGroup[];
	// The element that opens the menu. The default is a quiet "more" button.
	trigger?: ReactElement;
	triggerTooltip?: string;
	align?: "start" | "center" | "end";
	className?: string;
	onOpenChange?: (open: boolean) => void;
};

const isMenuGroup = (item: MenuItem | MenuGroup): item is MenuGroup => item.type === "group";

const menuGroups = (items: readonly MenuItem[] | readonly MenuGroup[]): readonly MenuGroup[] => {
	if (items.length > 0 && items.every(isMenuGroup)) return items;
	return [{ type: "group", items: items as readonly MenuItem[] }];
};

function MenuItemRow({ item }: { item: MenuItem }) {
	return (
		<BaseMenu.Item
			disabled={item.disabled}
			onClick={item.onSelect}
			className={cx(
				"flex items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
				item.detail === undefined ? "h-7" : "min-h-8 py-1.5",
				item.danger ? "text-danger data-highlighted:bg-danger-soft" : "text-fg data-highlighted:bg-bg",
				"data-disabled:opacity-50",
			)}
		>
			{item.icon && (
				<span
					aria-hidden="true"
					className={cx(
						"inline-flex size-3.5 shrink-0 *:size-full",
						item.danger ? "text-danger" : item.detailTone === "warning" ? "text-warning" : "text-fg-muted",
					)}
				>
					{item.icon}
				</span>
			)}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate">{item.label}</span>
				{item.detail !== undefined && (
					<span className={cx("truncate text-xs", item.detailTone === "warning" ? "text-warning" : "text-fg-muted")}>
						{item.detail}
					</span>
				)}
			</span>
			{item.kbd && <Kbd>{item.kbd}</Kbd>}
		</BaseMenu.Item>
	);
}

// The item that one key press runs while the menu is open. The key matches
// the `kbd` of an item of one character, such as the 1 of a first choice. A
// press that carries a modifier belongs to the browser or the operating
// system, so it runs no item, and a disabled item takes no press.
const itemForKey = (groups: readonly MenuGroup[], event: KeyboardEvent) => {
	if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key.length !== 1) return undefined;
	const key = event.key.toLowerCase();
	return groups
		.flatMap((group) => group.items)
		.find((item) => item.disabled !== true && item.kbd?.length === 1 && item.kbd.toLowerCase() === key);
};

// A list of actions under a button. Arrow keys move between items, Enter runs
// one, Escape closes and returns focus to the trigger.
export function Menu({ label, items, trigger, triggerTooltip, align = "end", className, onOpenChange }: MenuProps) {
	const [open, setOpen] = useState(false);
	const groups = menuGroups(items).filter((group) => group.items.length > 0);
	const changeOpen = (next: boolean) => {
		setOpen(next);
		onOpenChange?.(next);
	};
	const runKey = (event: KeyboardEvent) => {
		const item = itemForKey(groups, event);
		if (!item) return;
		event.preventDefault();
		changeOpen(false);
		item.onSelect();
	};
	const button = (
		<BaseMenu.Trigger
			aria-label={label}
			render={trigger}
			className={
				trigger
					? undefined
					: cx(
							"inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition duration-hover ease-out",
							hitArea.box28Bordered,
							"hover:bg-fg/6 hover:text-fg active:bg-fg/10 data-popup-open:bg-fg/10 data-popup-open:text-fg",
							"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
							"disabled:text-fg-faint disabled:pointer-events-none",
						)
			}
		>
			{trigger ? undefined : (
				<span aria-hidden="true" className="inline-flex size-3.5 *:size-full">
					<DotsThree />
				</span>
			)}
		</BaseMenu.Trigger>
	);
	return (
		<BaseMenu.Root open={open} onOpenChange={changeOpen}>
			{triggerTooltip ? <Tooltip content={triggerTooltip}>{button}</Tooltip> : button}
			<BaseMenu.Portal>
				<BaseMenu.Positioner align={align} sideOffset={4} className="z-50 outline-none">
					<BaseMenu.Popup
						onKeyDown={runKey}
						className={cx(
							"min-w-40 origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
							popupMotion,
							"duration-popover",
							className,
						)}
					>
						{groups.map((group, index) => (
							<BaseMenu.Group key={group.label ?? index}>
								{index > 0 && <BaseMenu.Separator className="-mx-1 my-1 h-px bg-border" />}
								{group.label && (
									<BaseMenu.GroupLabel className="px-2 py-1 text-kbd font-medium tracking-normal text-fg-faint">
										{group.label}
									</BaseMenu.GroupLabel>
								)}
								{group.items.map((item) => (
									<MenuItemRow key={item.id ?? item.label} item={item} />
								))}
							</BaseMenu.Group>
						))}
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}
