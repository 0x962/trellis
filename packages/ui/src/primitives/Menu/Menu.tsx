import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check, DotsThree } from "@phosphor-icons/react";
import { type KeyboardEvent, type ReactElement, useState } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { popupMotion } from "../../utils/popupMotion";
import { Kbd } from "../Kbd";
import { Tooltip } from "../Tooltip";
import { isCheckableItem, itemForKey, type MenuGroup, type MenuItem, menuGroups } from "./menuRows";

export type { MenuGroup, MenuItem } from "./menuRows";

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

const rowClass = (item: MenuItem) =>
	cx(
		"flex items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
		// A row of a list carries its own 44 px box on a coarse pointer. An
		// invisible hit layer cannot do it here, because the row above and
		// the row below each paint over it. The sidebar rows and the
		// settings rows grow the same way.
		item.detail === undefined ? "h-7 pointer-coarse:h-11" : "min-h-8 py-1.5 pointer-coarse:min-h-11",
		item.danger ? "text-danger data-highlighted:bg-danger-soft" : "text-fg data-highlighted:bg-bg",
		"data-disabled:opacity-50",
	);

function MenuRowContent({ item }: { item: MenuItem }) {
	return (
		<>
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
		</>
	);
}

function MenuItemRow({ item }: { item: MenuItem }) {
	// A checkbox item keeps the menu open when it is clicked, because a person
	// ticks several settings in one visit. Every row of this menu runs one
	// thing and closes, so `closeOnClick` puts the state row back on the
	// behavior of the plain row beside it.
	if (isCheckableItem(item)) {
		return (
			<BaseMenu.CheckboxItem
				disabled={item.disabled}
				checked={item.checked}
				closeOnClick
				onClick={item.onSelect}
				className={rowClass(item)}
			>
				<MenuRowContent item={item} />
				<BaseMenu.CheckboxItemIndicator className="inline-flex size-3.5 shrink-0 text-accent *:size-full">
					<Check aria-hidden="true" />
				</BaseMenu.CheckboxItemIndicator>
			</BaseMenu.CheckboxItem>
		);
	}
	return (
		<BaseMenu.Item disabled={item.disabled} onClick={item.onSelect} className={rowClass(item)}>
			<MenuRowContent item={item} />
		</BaseMenu.Item>
	);
}

// A list of actions under a button. Arrow keys move between items, Enter runs
// one, Escape closes and returns focus to the trigger.
export function Menu({ label, items, trigger, triggerTooltip, align = "end", className, onOpenChange }: MenuProps) {
	const [open, setOpen] = useState(false);
	const groups = menuGroups(items);
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
