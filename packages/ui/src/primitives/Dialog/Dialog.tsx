import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { popupMotion } from "../../utils/popupMotion";

export type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The accessible name. It is the visible heading unless `header` is set.
	title: string;
	// A row the caller draws in place of the heading, such as a project
	// chip and a close button. The title then stays for assistive tech only.
	header?: ReactNode;
	// A bare dialog draws no heading block at all. The title stays in the
	// DOM for assistive tech, and the caller draws every visible part.
	bare?: boolean;
	description?: string;
	children: ReactNode;
	modal?: boolean | "trap-focus";
	// md is 400 px wide; lg is the 640 px composer.
	size?: "md" | "lg";
	// The element that takes focus when the dialog opens. Base UI's own
	// rule, the first tabbable element, applies when this is absent.
	initialFocus?: ComponentProps<typeof BaseDialog.Popup>["initialFocus"];
	className?: string;
};

const sizes = { md: "w-100", lg: "w-160" } as const;

// Below 768 px the dialog is a sheet on the bottom edge: full width, round
// on top only, and never taller than 90% of the screen.
const bottomSheet =
	"max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-xl max-md:rounded-b-none max-md:max-h-[90dvh] max-md:overflow-y-auto";

// A modal over a scrim. Base UI moves focus inside on the frame after it
// opens, unless a child took focus first. Focus stays inside until it
// closes, and returns to the opener. Escape and a click on the scrim ask to
// close.
//
// A dialog can open from inside another dialog, such as a confirm inside a
// sheet. Base UI leaves out the backdrop of a dialog inside another dialog.
// It also closes a modal dialog on an outside click only when the click
// lands on the backdrop of that dialog. `forceRender` keeps the backdrop, so
// a click beside the inner dialog closes the inner dialog alone.
export function Dialog({
	open,
	onOpenChange,
	title,
	header,
	bare = false,
	description,
	children,
	modal = true,
	size = "md",
	initialFocus,
	className,
}: DialogProps) {
	return (
		<BaseDialog.Root open={open} modal={modal} onOpenChange={(next) => onOpenChange(next)}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop
					forceRender
					className="fixed inset-0 z-50 bg-scrim transition-opacity duration-popover ease-out data-starting-style:opacity-0 data-ending-style:opacity-0"
				/>
				<BaseDialog.Popup
					aria-modal="true"
					initialFocus={initialFocus}
					className={cx(
						"fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-elevated p-4 text-base text-fg shadow-lg outline-none",
						sizes[size],
						bottomSheet,
						popupMotion,
						"duration-popover",
						className,
					)}
				>
					{bare && <BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>}
					{!bare && (
						<div className="flex flex-col gap-1">
							{header === undefined ? (
								<BaseDialog.Title className="text-md font-semibold text-fg">{title}</BaseDialog.Title>
							) : (
								<>
									<BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
									{header}
								</>
							)}
							{description && (
								<BaseDialog.Description className="text-sm text-fg-muted">{description}</BaseDialog.Description>
							)}
						</div>
					)}
					{children}
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
