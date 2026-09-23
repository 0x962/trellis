import type { TicketSummary } from "@trellis/api";
import { cx, ticketCardFrame } from "@trellis/ui";
import type { RefObject } from "react";
import type { DragPreviewFrame } from "../../dragPreview";
import { CardContent, type CardContentProps } from "../CardContent";

export type CardPreviewProps = {
	ticket: TicketSummary;
	frame: DragPreviewFrame;
	positionRef: RefObject<HTMLDivElement | null>;
	surfaceRef: RefObject<HTMLDivElement | null>;
	showStatus?: boolean;
	lineChanges?: CardContentProps["lineChanges"];
	lineChangesPending?: boolean;
};

// The outer transform follows the pointer. The inner transform rotates around
// the grabbed point, so that point stays under the pointer during a swing.
export function CardPreview({
	ticket,
	frame,
	positionRef,
	surfaceRef,
	showStatus,
	lineChanges,
	lineChangesPending,
}: CardPreviewProps) {
	return (
		<div
			ref={positionRef}
			data-card-preview=""
			aria-hidden="true"
			style={{ width: `${frame.width}px`, transform: `translate3d(${frame.left}px, ${frame.top}px, 0)` }}
			className="pointer-events-none fixed top-0 left-0 z-50"
		>
			<div
				ref={surfaceRef}
				style={{ transformOrigin: `${frame.offsetX}px ${frame.offsetY}px` }}
				className={cx(
					ticketCardFrame,
					"min-h-19 gap-1.5 border-border-strong bg-elevated shadow-lg-no-ring transition-transform duration-row ease-out motion-reduce:transition-none",
				)}
			>
				<CardContent
					ticket={ticket}
					showStatus={showStatus}
					lineChanges={lineChanges}
					lineChangesPending={lineChangesPending}
				/>
			</div>
		</div>
	);
}
