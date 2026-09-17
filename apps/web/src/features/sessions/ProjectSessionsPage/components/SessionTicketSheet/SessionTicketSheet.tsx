import { ArrowSquareOut, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { IconButton, Sheet, Tooltip } from "@trellis/ui";
import { useRef } from "react";
import { runTicketEscape } from "../../../../ticket/hooks/useTicketEscape/useTicketEscape";
import { TicketView } from "../../../../ticket/TicketView";

export function SessionTicketSheet({
	identifier,
	open,
	onClose,
}: {
	identifier: string;
	open: boolean;
	onClose: () => void;
}) {
	const closeButton = useRef<HTMLButtonElement>(null);
	return (
		<Sheet
			open={open}
			title={identifier}
			bare
			initialFocus={closeButton}
			onOpenChange={(next, details) => {
				if (next) return;
				if (details.reason === "escape-key") {
					details.cancel();
					const focused = document.activeElement;
					runTicketEscape(focused instanceof HTMLElement ? focused : null, {
						reviewOpen: false,
						closeReview: onClose,
						returnToList: onClose,
					});
				} else onClose();
			}}
		>
			<div className="flex h-full min-h-0 flex-col">
				<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
					<span className="min-w-0 flex-1 truncate font-mono text-sm text-fg-muted">{identifier}</span>
					<Tooltip content="Open full ticket">
						<IconButton
							label="Open full ticket"
							icon={<ArrowSquareOut />}
							nativeButton={false}
							render={<Link to="/t/$identifier" params={{ identifier }} />}
						/>
					</Tooltip>
					<Tooltip content="Close ticket">
						<IconButton ref={closeButton} label="Close ticket" icon={<X />} onClick={onClose} />
					</Tooltip>
				</header>
				<div className="flex min-h-0 flex-1 flex-col pt-3">
					<TicketView identifier={identifier} embedded onReturnToList={onClose} />
				</div>
			</div>
		</Sheet>
	);
}
