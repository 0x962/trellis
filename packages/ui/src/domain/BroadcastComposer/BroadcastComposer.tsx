import { CaretRight, X } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";
import { Tooltip } from "../../primitives/Tooltip";
import { TicketComposer } from "../TicketComposer";
import "./broadcastComposer.css";

export function BroadcastComposer({
	scope,
	busy,
	onClose,
	children,
	...props
}: Omit<ComponentProps<typeof TicketComposer>, "open" | "onOpenChange" | "header"> & {
	scope: string;
	busy: boolean;
	onClose: () => void;
	children: ReactNode;
}) {
	return (
		<TicketComposer
			{...props}
			open
			onOpenChange={(open) => !open && onClose()}
			header={
				<>
					<span className="broadcast-composer-scope" title={scope}>
						{scope}
					</span>
					<CaretRight className="size-2.5 shrink-0" aria-hidden="true" />
					<span>Broadcast</span>
					<Tooltip content="Close">
						<IconButton label="Close" icon={<X />} disabled={busy} onClick={onClose} className="ml-auto" />
					</Tooltip>
				</>
			}
		>
			<div className="broadcast-composer-title" aria-hidden="true">
				{props.title}
			</div>
			<p className="sr-only">{props.description}</p>
			{children}
		</TicketComposer>
	);
}
