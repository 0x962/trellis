import { Menu as BaseMenu } from "@base-ui/react/menu";
import { DotsThree } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { popupMotion } from "../../utils/popupMotion";
import { Kbd } from "../Kbd";
import { Tooltip } from "../Tooltip";

export type MenuItem = {
	type?: "item";
	label: string;
	onSelect: () => void;
	// An icon element, shown at 14 px before the label.
	icon?: ReactElement;
	// The key that runs the item from the page, shown as a Kbd.
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
				"flex h-7 items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
				item.danger ? "text-danger data-highlighted:bg-danger-soft" : "text-fg data-highlighted:bg-bg",
				"data-disabled:opacity-50",
			)}
		>
			{item.icon && (
				<span
					aria-hidden="true"
					className={cx("inline-flex size-3.5 shrink-0 *:size-full", item.danger ? "text-danger" : "text-fg-muted")}
				>
					{item.icon}
				</span>
			)}
			<span className="flex-1">{item.label}</span>
			{item.kbd && <Kbd>{item.kbd}</Kbd>}
		</BaseMenu.Item>
	);
}

// A list of actions under a button. Arrow keys move between items, Enter runs
// one, Escape closes and returns focus to the trigger.
export function Menu({ label, items, trigger, triggerTooltip, align = "end", className, onOpenChange }: MenuProps) {
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
		<BaseMenu.Root onOpenChange={onOpenChange}>
			{triggerTooltip ? <Tooltip content={triggerTooltip}>{button}</Tooltip> : button}
			<BaseMenu.Portal>
				<BaseMenu.Positioner align={align} sideOffset={4} className="z-50 outline-none">
					<BaseMenu.Popup
						className={cx(
							"min-w-40 origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
							popupMotion,
							"duration-popover",
							className,
						)}
					>
						{menuGroups(items)
							.filter((group) => group.items.length > 0)
							.map((group, index) => (
								<BaseMenu.Group key={group.label ?? index}>
									{index > 0 && <BaseMenu.Separator className="-mx-1 my-1 h-px bg-border" />}
									{group.label && (
										<BaseMenu.GroupLabel className="px-2 py-1 text-kbd font-medium tracking-normal text-fg-faint">
											{group.label}
										</BaseMenu.GroupLabel>
									)}
									{group.items.map((item) => (
										<MenuItemRow key={item.label} item={item} />
									))}
								</BaseMenu.Group>
							))}
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}
