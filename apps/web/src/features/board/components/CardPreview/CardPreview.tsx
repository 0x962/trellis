import type { TicketSummary } from "@trellis/api";
import { CardContent } from "../CardContent";

export type CardPreviewProps = {
	ticket: TicketSummary;
	// The width of the card on the board, in px.
	width: number;
	showStatus?: boolean;
};

// The image under the pointer while a card drags. The browser takes one
// snapshot of it, so it carries its own surface, border, and padding: the
// drag library makes the container around it transparent.
export function CardPreview({ ticket, width, showStatus }: CardPreviewProps) {
	return (
		<div
			data-card-preview=""
			style={{ width: `${width}px`, transform: "rotate(2deg)" }}
			className="flex min-h-19 flex-col gap-1.5 rounded-md border-x border-b border-border-strong bg-elevated p-3 shadow-kanban-drag"
		>
			<CardContent ticket={ticket} showStatus={showStatus} />
		</div>
	);
}
