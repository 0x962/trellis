import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../utils/cx";
import { IconButton } from "../IconButton";

export type SheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The accessible name, shown in the header.
	title: string;
	side?: "left" | "right";
	// A modal sheet draws a scrim, traps focus, and closes on a click outside.
	// The default is modal. The ticket peek passes false: the page behind it
	// stays reachable and focusable, and only Escape or the close button
	// closes it.
	modal?: boolean;
	// The panel width in px. A resizable peek passes the width it holds.
	width?: number;
	// The element a resizable peek drags to change its width. The Sheet places
	// it on the edge that faces the page; the drag logic belongs to the caller.
	resizeHandle?: ReactNode;
	children: ReactNode;
	className?: string;
};

// A panel that slides in from an edge, for the ticket peek. Under reduced
// motion it fades in place. It is a dialog: Base UI moves focus inside when
// it opens, Escape closes it, and focus returns to where it was.
//
// The modal form is the Dialog behavior with the sheet's shape. The peek
// passes modal={false} so that j and k walk the list behind it while the
// panel shows the ticket. Base UI closes a non-modal dialog when a press or
// a focus move lands outside it. `disablePointerDismissal` keeps the sheet
// open through both. Only Escape, the close button, or the caller closes it.
//
// The resize handle renders after the header and the content. Base UI moves
// initial focus onto the first tabbable element, so the focus lands on the
// close button, never on the handle. The handle is positioned against the
// panel, so its place in the DOM changes nothing on screen.
export function Sheet({
	open,
	onOpenChange,
	title,
	side = "right",
	modal = true,
	width = 720,
	resizeHandle,
	children,
	className,
}: SheetProps) {
	return (
		<BaseDialog.Root
			open={open}
			onOpenChange={(next) => onOpenChange(next)}
			modal={modal}
			disablePointerDismissal={!modal}
		>
			<BaseDialog.Portal>
				{modal && (
					<BaseDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-peek ease-out data-starting-style:opacity-0 data-ending-style:opacity-0" />
				)}
				<BaseDialog.Popup
					aria-modal={modal ? "true" : "false"}
					style={{ width }}
					className={cx(
						"fixed inset-y-0 z-50 flex max-w-full flex-col border-border bg-surface text-base text-fg shadow-lg outline-none",
						"transition-transform duration-peek ease-out",
						"motion-reduce:transition-opacity motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0",
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
					{resizeHandle && (
						<div className={cx("absolute inset-y-0 z-10 flex", side === "right" ? "left-0" : "right-0")}>
							{resizeHandle}
						</div>
					)}
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
