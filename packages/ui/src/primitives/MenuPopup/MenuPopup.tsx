import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Check } from "@phosphor-icons/react";
import { cx } from "../../utils/cx";
import { linkPress } from "../../utils/linkPress";
import { popupMotion } from "../../utils/popupMotion";
import { Kbd } from "../Kbd";
import { isCheckableItem, itemForKey, type MenuGroup, type MenuItem, menuGroups } from "../Menu/menuRows";

type Props = Omit<BaseMenu.Popup.Props, "children" | "className"> & {
	items: readonly MenuItem[] | readonly MenuGroup[];
	onClose: () => void;
	className?: string;
};

const rowClass = (item: MenuItem) =>
	cx(
		"flex items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
		// Each row needs its own 44 px touch target because adjacent rows
		// cover an invisible hit area.
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
	// Every action closes the menu, including an action with a checked state.
	if (isCheckableItem(item)) {
		return (
			<BaseMenu.CheckboxItem
				disabled={item.disabled}
				checked={item.checked}
				closeOnClick
				onClick={(event) => item.onSelect(linkPress(event))}
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
		<BaseMenu.Item
			disabled={item.disabled}
			onClick={(event) => item.onSelect(linkPress(event))}
			className={rowClass(item)}
		>
			<MenuRowContent item={item} />
		</BaseMenu.Item>
	);
}

// Menu and ContextMenu use the same Base UI popup and item primitives.
export function MenuPopup({ items, onClose, className, onKeyDown, ...props }: Props) {
	const groups = menuGroups(items);
	const runKey: NonNullable<BaseMenu.Popup.Props["onKeyDown"]> = (event) => {
		onKeyDown?.(event);
		const item = itemForKey(groups, event);
		if (!item) return;
		event.preventDefault();
		onClose();
		item.onSelect({
			metaKey: event.metaKey,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			button: 0,
		});
	};
	return (
		<BaseMenu.Popup
			{...props}
			onKeyDown={runKey}
			className={cx(
				"min-w-40 max-w-(--available-width) max-sm:min-w-0 origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
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
	);
}
