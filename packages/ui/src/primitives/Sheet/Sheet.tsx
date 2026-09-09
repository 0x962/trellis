import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import { usePopupFocus } from "../hooks/usePopupFocus";
import { IconButton } from "../IconButton";

export type SheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The accessible name, shown in the header.
	title: string;
	side?: "left" | "right";
	children: ReactNode;
	className?: string;
};

// A panel that slides in from an edge, for the ticket peek. It is a dialog:
// focus moves inside when it opens, Escape closes it, and focus returns to
// where it was.
export function Sheet({ open, onOpenChange, title, side = "right", children, className }: SheetProps) {
	const { onPopupMount, finalFocus } = usePopupFocus();
	return (
		<BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-peek ease-out data-starting-style:opacity-0 data-ending-style:opacity-0" />
				<BaseDialog.Popup
					ref={onPopupMount}
					initialFocus={false}
					finalFocus={finalFocus}
					aria-modal="true"
					className={cx(
						"fixed inset-y-0 z-50 flex w-160 max-w-full flex-col border-border bg-surface text-base text-fg shadow-lg outline-none",
						"transition-transform duration-peek ease-out",
						side === "right"
							? "right-0 border-l data-starting-style:translate-x-full data-ending-style:translate-x-full"
							: "left-0 border-r data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
						className,
					)}
				>
					<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
						<BaseDialog.Title className="flex-1 truncate font-mono text-sm text-fg-muted">{title}</BaseDialog.Title>
						<BaseDialog.Close render={<IconButton label="Close" icon={<X />} />} />
					</header>
					<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
