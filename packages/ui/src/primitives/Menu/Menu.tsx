import { Menu as BaseMenu } from "@base-ui/react/menu";
import { DotsThree } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { cx } from "../../utils/cx";
import { hitArea } from "../../utils/hitArea";
import { MenuPopup } from "../MenuPopup";
import { Tooltip } from "../Tooltip";
import type { MenuGroup, MenuItem } from "./menuRows";

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

// A list of actions under a button. Arrow keys move between items, Enter runs
// one, Escape closes and returns focus to the trigger.
export function Menu({ label, items, trigger, triggerTooltip, align = "end", className, onOpenChange }: MenuProps) {
	const [open, setOpen] = useState(false);
	const changeOpen = (next: boolean) => {
		setOpen(next);
		onOpenChange?.(next);
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
					<MenuPopup items={items} onClose={() => changeOpen(false)} className={className} />
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}
