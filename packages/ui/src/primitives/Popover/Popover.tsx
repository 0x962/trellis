import { Popover as BasePopover } from "@base-ui/react/popover";
import { type ReactElement, type ReactNode, type RefObject, useState } from "react";
import { cx } from "../../utils/cx";
import { popupMotion } from "../../utils/popupMotion";
import { Tooltip } from "../Tooltip";

export type PopoverProps = {
	// The element that opens the popover, usually a Button. It receives the
	// trigger's click handler and aria attributes.
	trigger: ReactElement;
	triggerTooltip?: string;
	children: ReactNode;
	// The accessible name of the panel.
	label?: string;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	// The element that takes focus when the panel opens. Without it, the
	// panel itself takes focus unless a child took it first.
	initialFocus?: RefObject<HTMLElement | null>;
	// The element that takes focus when the panel closes. Without it, the
	// trigger takes it back.
	finalFocus?: RefObject<HTMLElement | null>;
	className?: string;
	overlapTrigger?: boolean;
};

// A small panel anchored to its trigger, for options that do not need a
// modal. Escape and an outside click close it. Focus returns to the trigger,
// unless the outside click landed on a control, which then keeps the focus
// it took.
export function Popover({
	trigger,
	triggerTooltip,
	children,
	label,
	side = "bottom",
	align = "start",
	open,
	onOpenChange,
	initialFocus,
	finalFocus,
	className,
	overlapTrigger = false,
}: PopoverProps) {
	const [localOpen, setLocalOpen] = useState(false);
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const [suppressTooltip, setSuppressTooltip] = useState(false);
	const shown = open ?? localOpen;
	const changeOpen = (next: boolean) => {
		if (!next) {
			setTooltipOpen(false);
			setSuppressTooltip(true);
		}
		if (open === undefined) setLocalOpen(next);
		onOpenChange?.(next);
	};
	const changeTooltipOpen = (next: boolean) => {
		if (!next) {
			setTooltipOpen(false);
			setSuppressTooltip(false);
			return;
		}
		if (!suppressTooltip) setTooltipOpen(true);
	};
	return (
		<BasePopover.Root open={shown} onOpenChange={changeOpen}>
			{triggerTooltip ? (
				<Tooltip content={triggerTooltip} open={tooltipOpen && !shown} onOpenChange={changeTooltipOpen}>
					<BasePopover.Trigger render={trigger} />
				</Tooltip>
			) : (
				<BasePopover.Trigger render={trigger} />
			)}
			<BasePopover.Portal>
				<BasePopover.Positioner
					side={side}
					align={align}
					sideOffset={overlapTrigger ? ({ anchor }) => -anchor.height : 6}
					className="z-50 outline-none"
				>
					<BasePopover.Popup
						aria-label={label}
						initialFocus={initialFocus}
						finalFocus={finalFocus}
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
