import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cx } from "../../../../utils/cx";
import { popupMotion } from "../../../../utils/popupMotion";

export type CommandDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// A Command.
	children: ReactNode;
	className?: string;
};

// The Cmd-K surface: a panel near the top of the window over a scrim, with
// the Command inside. Escape and a click on the scrim close it.
export function CommandDialog({ open, onOpenChange, children, className }: CommandDialogProps) {
	return (
		<BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-popover ease-out data-starting-style:opacity-0 data-ending-style:opacity-0" />
				<BaseDialog.Popup
					aria-modal="true"
					aria-label="Command menu"
					className={cx(
						"fixed top-[20vh] left-1/2 z-50 w-140 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-elevated shadow-lg outline-none",
						popupMotion,
						"duration-popover",
						className,
					)}
				>
					{children}
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
