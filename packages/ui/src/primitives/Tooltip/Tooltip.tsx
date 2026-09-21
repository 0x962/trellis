import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { cx } from "../../utils/cx";
import { popupMotion } from "../../utils/popupMotion";

export type TooltipProps = {
	content: ReactNode;
	description?: ReactNode;
	delay?: number;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	// The element the tooltip describes. It receives the hover and focus
	// handlers and, while the tooltip is open, aria-describedby.
	children: ReactElement;
	side?: "top" | "bottom" | "left" | "right";
	className?: string;
};

// A hint on hover or keyboard focus. The trigger keeps its own name; the
// tooltip only describes it. Base UI treats a tooltip as a visual-only popup,
// so the tooltip role and the describedby link are set here.
export function Tooltip({
	content,
	description,
	delay = 400,
	open,
	onOpenChange,
	children,
	side = "top",
	className,
}: TooltipProps) {
	const id = useId();
	const [localOpen, setLocalOpen] = useState(false);
	const shown = open ?? localOpen;
	const setShown = onOpenChange ?? setLocalOpen;
	return (
		<BaseTooltip.Root open={shown} onOpenChange={setShown}>
			<BaseTooltip.Trigger render={children} delay={delay} aria-describedby={shown ? id : undefined} />
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
					<BaseTooltip.Popup
						id={id}
						role="tooltip"
						className={cx(
							"origin-(--transform-origin) text-xs font-medium",
							description === undefined
								? "rounded-sm bg-fg px-1.5 py-0.5 text-bg shadow-sm"
								: "max-w-64 rounded-lg border border-border bg-elevated p-3 text-fg shadow-md",
							delay > 0 && popupMotion,
							delay > 0 && "duration-hover data-instant:transition-none",
							className,
						)}
					>
						{content}
						{description !== undefined && (
							<p className="mt-1 text-xs leading-5 font-normal text-fg-muted text-pretty">{description}</p>
						)}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}
