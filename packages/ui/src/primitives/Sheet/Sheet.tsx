import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { IconButton } from "../IconButton";

export type SheetProps = {
	open: boolean;
	onOpenChange: NonNullable<ComponentProps<typeof BaseDialog.Root>["onOpenChange"]>;
	// The accessible name, shown in the header.
	title: string;
	side?: "left" | "right";
	// A modal sheet draws a scrim and traps focus. A non-modal sheet keeps the page reachable.
	modal?: boolean;
	// An outside click closes a non-modal sheet when this value is true.
	dismissOnOutside?: boolean;
	// The panel width: a number in px, or a CSS width such as "100%". A
	// resizable peek passes the width it holds.
	width?: number | string;
	// A bare sheet draws no header of its own. The title stays in the DOM
	// for assistive tech, and the caller draws the visible header.
	bare?: boolean;
	// The element that takes focus when the sheet opens. Base UI's own
	// rule, the first tabbable element, applies when this is absent.
	initialFocus?: ComponentProps<typeof BaseDialog.Popup>["initialFocus"];
	// The element a resizable peek drags to change its width. The Sheet places
	// it on the edge that faces the page; the drag logic belongs to the caller.
	resizeHandle?: ReactNode;
	// The look of the header title. The default is the peek's mono ID.
	titleClassName?: string;
	// The slide duration: 240 ms for the peek, 160 ms for a menu sheet such
	// as the phone sidebar.
	motion?: "peek" | "popover";
	children: ReactNode;
	className?: string;
};

// A panel that slides in from an edge, for the ticket peek. Under reduced
// motion it fades in place. It is a dialog: Base UI moves focus inside when
// it opens, Escape closes it, and focus returns to where it was.
//
// A non-modal sheet lets keyboard shortcuts act on the page behind it.
// `dismissOnOutside` controls whether an outside pointer press closes it.
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
	dismissOnOutside = false,
	width = 720,
	bare = false,
	initialFocus,
	resizeHandle,
	titleClassName = "font-mono text-sm text-fg-muted",
	motion = "peek",
	children,
	className,
}: SheetProps) {
	return (
		<BaseDialog.Root
			open={open}
			onOpenChange={onOpenChange}
			modal={modal}
			disablePointerDismissal={!modal && !dismissOnOutside}
		>
			<BaseDialog.Portal>
				{modal && (
					<BaseDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-peek ease-out data-starting-style:opacity-0 data-ending-style:opacity-0" />
				)}
				<BaseDialog.Popup
					aria-label={title}
					aria-modal={modal ? "true" : "false"}
					initialFocus={initialFocus}
					style={{ width }}
					className={cx(
						"fixed inset-y-0 z-50 flex max-w-full flex-col border-border bg-surface text-base text-fg shadow-lg outline-none",
						"transition-transform ease-out",
						motion === "peek" ? "duration-peek" : "duration-popover",
						"motion-reduce:transition-opacity motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0",
						side === "right"
							? "right-0 border-l data-starting-style:translate-x-full data-ending-style:translate-x-full"
							: "left-0 border-r data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
						className,
					)}
				>
					{bare ? (
						<BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
					) : (
						<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
							<BaseDialog.Title className={cx("flex-1 truncate", titleClassName)}>{title}</BaseDialog.Title>
							<BaseDialog.Close render={<IconButton label="Close" icon={<X />} />} />
						</header>
					)}
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
