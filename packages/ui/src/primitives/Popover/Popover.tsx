import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { popupMotion } from "../../utils/popupMotion";

export type PopoverProps = {
	// The element that opens the popover, usually a Button. It receives the
	// trigger's click handler and aria attributes.
	trigger: ReactElement;
	children: ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: string;
};

// A small panel anchored to its trigger, for options that do not need a
// modal. Escape and an outside click close it. Focus returns to the trigger,
// unless the outside click landed on a control, which then keeps the focus
// it took.
export function Popover({
	trigger,
	children,
	side = "bottom",
	align = "start",
	open,
	onOpenChange,
	className,
}: PopoverProps) {
	return (
		<BasePopover.Root open={open} onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}>
			<BasePopover.Trigger render={trigger} />
			<BasePopover.Portal>
				<BasePopover.Positioner side={side} align={align} sideOffset={6} className="z-50 outline-none">
					<BasePopover.Popup
						className={cx(
							"origin-(--transform-origin) rounded-lg border border-border bg-elevated p-2 text-base text-fg shadow-md outline-none",
							popupMotion,
							"duration-popover",
							className,
						)}
					>
						{children}
					</BasePopover.Popup>
				</BasePopover.Positioner>
			</BasePopover.Portal>
		</BasePopover.Root>
	);
}
