import { Menu as BaseMenu } from "@base-ui/react/menu";
import { DotsThree } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { popupMotion } from "../../utils/popupMotion";
import { Kbd } from "../Kbd";
import { Tooltip } from "../Tooltip";

export type MenuItem = {
	label: string;
	onSelect: () => void;
	// A lucide icon element, shown at 14 px before the label.
	icon?: ReactElement;
	// The key that runs the item from the page, shown as a Kbd.
	kbd?: string;
	disabled?: boolean;
	// A danger item is red: delete, cancel.
	danger?: boolean;
};

export type MenuProps = {
	// The accessible name of the trigger.
	label: string;
	items: readonly MenuItem[];
	// The element that opens the menu. The default is a quiet "more" button.
	trigger?: ReactElement;
	triggerTooltip?: string;
	align?: "start" | "center" | "end";
	className?: string;
	onOpenChange?: (open: boolean) => void;
};

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
						{items.map((item) => (
							<BaseMenu.Item
								key={item.label}
								disabled={item.disabled}
								onClick={item.onSelect}
								className={cx(
									"flex h-7 items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
									item.danger ? "text-danger data-highlighted:bg-danger-soft" : "text-fg data-highlighted:bg-bg",
									"data-disabled:opacity-50",
								)}
							>
								{item.icon && (
									<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 text-fg-muted *:size-full">
										{item.icon}
									</span>
								)}
								<span className="flex-1">{item.label}</span>
								{item.kbd && <Kbd>{item.kbd}</Kbd>}
							</BaseMenu.Item>
						))}
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}
