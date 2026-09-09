import { Menu as BaseMenu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";
import type { ReactElement } from "react";
import { cx } from "../../utils/cx";
import { Kbd } from "../Kbd";

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
	align?: "start" | "center" | "end";
	className?: string;
};

// A list of actions under a button. Arrow keys move between items, Enter runs
// one, Escape closes and returns focus to the trigger.
export function Menu({ label, items, trigger, align = "end", className }: MenuProps) {
	return (
		<BaseMenu.Root>
			<BaseMenu.Trigger
				aria-label={label}
				render={trigger}
				className={
					trigger
						? undefined
						: cx(
								"inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition duration-hover ease-out",
								"hover:bg-bg hover:text-fg data-popup-open:bg-bg data-popup-open:text-fg",
								"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
								"disabled:opacity-50 disabled:pointer-events-none",
							)
				}
			>
				{trigger ? undefined : (
					<span aria-hidden="true" className="inline-flex size-3.5 *:size-full">
						<MoreHorizontal />
					</span>
				)}
			</BaseMenu.Trigger>
			<BaseMenu.Portal>
				<BaseMenu.Positioner align={align} sideOffset={4} className="z-50 outline-none">
					<BaseMenu.Popup
						className={cx(
							"min-w-40 origin-(--transform-origin) rounded-lg border border-border bg-elevated p-1 shadow-md outline-none",
							"transition-[opacity,scale] duration-popover ease-out data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0",
							className,
						)}
					>
						{items.map((item) => (
							<BaseMenu.Item
								key={item.label}
								disabled={item.disabled}
								onClick={item.onSelect}
								className={cx(
									"flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none",
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
