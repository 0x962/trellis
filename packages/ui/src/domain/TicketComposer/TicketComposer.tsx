import type { ComponentProps, ReactNode } from "react";
import { Dialog } from "../../primitives/Dialog";
import "./ticketComposer.css";
import "./ticketComposerResponsive.css";

export function TicketComposer({
	header,
	footer,
	children,
	onSubmit,
	...props
}: Omit<ComponentProps<typeof Dialog>, "header" | "bare" | "size"> & {
	header: ReactNode;
	footer: ReactNode;
	onSubmit: (keepOpen?: boolean) => void;
}) {
	return (
		<Dialog {...props} bare size="lg" className="ticket-composer">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					onSubmit();
				}}
				onKeyDownCapture={(event) => {
					if (
						!event.defaultPrevented &&
						!event.nativeEvent.isComposing &&
						(event.metaKey || event.ctrlKey) &&
						event.key === "Enter"
					) {
						event.preventDefault();
						onSubmit(event.shiftKey ? true : undefined);
					}
				}}
			>
				<header className="ticket-composer-header">{header}</header>
				<div className="ticket-composer-body">{children}</div>
				<footer className="ticket-composer-footer">{footer}</footer>
			</form>
		</Dialog>
	);
}
