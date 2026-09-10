import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import { popupMotion } from "../../utils/popupMotion";

export type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The accessible name, shown as the heading.
	title: string;
	description?: string;
	children: ReactNode;
	modal?: boolean | "trap-focus";
	// md is 400 px wide; lg is the 640 px composer.
	size?: "md" | "lg";
	className?: string;
};

const sizes = { md: "w-100", lg: "w-160" } as const;

// A modal over a scrim. Base UI moves focus inside on the frame after it
// opens, unless a child took focus first. Focus stays inside until it
// closes, and returns to the opener. Escape and a click on the scrim ask to
// close.
export function Dialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	modal = true,
	size = "md",
	className,
}: DialogProps) {
	return (
		<BaseDialog.Root open={open} modal={modal} onOpenChange={(next) => onOpenChange(next)}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-popover ease-out data-starting-style:opacity-0 data-ending-style:opacity-0" />
				<BaseDialog.Popup
					aria-modal="true"
					className={cx(
						"fixed top-1/2 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-elevated p-4 text-base text-fg shadow-lg outline-none",
						sizes[size],
						popupMotion,
						"duration-popover",
						className,
					)}
				>
					<div className="flex flex-col gap-1">
						<BaseDialog.Title className="text-md font-semibold text-fg">{title}</BaseDialog.Title>
						{description && (
							<BaseDialog.Description className="text-sm text-fg-muted">{description}</BaseDialog.Description>
						)}
					</div>
					{children}
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
