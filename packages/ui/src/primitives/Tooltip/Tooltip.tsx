import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { cx } from "../../utils/cx";

export type TooltipProps = {
	content: ReactNode;
	// The element the tooltip describes. It receives the hover and focus
	// handlers and, while the tooltip is open, aria-describedby.
	children: ReactElement;
	side?: "top" | "bottom" | "left" | "right";
	className?: string;
};

// A hint on hover or keyboard focus. The trigger keeps its own name; the
// tooltip only describes it. Base UI treats a tooltip as a visual-only popup,
// so the tooltip role and the describedby link are set here.
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
	const id = useId();
	const [open, setOpen] = useState(false);
	return (
		<BaseTooltip.Root open={open} onOpenChange={setOpen}>
			<BaseTooltip.Trigger render={children} delay={400} aria-describedby={open ? id : undefined} />
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
					<BaseTooltip.Popup
						id={id}
						role="tooltip"
						className={cx(
							"origin-(--transform-origin) rounded-sm bg-fg px-1.5 py-0.5 text-xs font-medium text-bg shadow-sm",
							"transition-[opacity,scale] duration-hover ease-out data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0 data-instant:transition-none",
							className,
						)}
					>
						{content}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
