import { BaseBoxShapeUtil, HTMLContainer, T, useEditor } from "tldraw";
import { cx } from "../../utils/cx";
import { ticketCardFrame } from "../ticketCardFrame";
import { type TicketShape, whiteboardActions } from "./types";
import { useWhiteboardContent } from "./whiteboardContext";

function TicketShapeContent({ shape }: { shape: TicketShape }) {
	const editor = useEditor();
	const { tickets } = useWhiteboardContent();
	const ticket = tickets.find((entry) => entry.id === shape.props.recordId);
	if (!ticket) return null;
	return (
		<HTMLContainer className="trellis-whiteboard-ticket" data-whiteboard-ticket={ticket.id}>
			<div
				className={cx(
					ticketCardFrame,
					"h-full gap-2 border-border bg-surface shadow-sm",
					!ticket.matched && "border-dashed",
				)}
				data-filter-match={ticket.matched}
			>
				<a
					href={`/t/${ticket.label}`}
					aria-label={`Open ${ticket.label}`}
					className="trellis-whiteboard-ticket-link absolute inset-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent"
					onClick={(event) => {
						if (event.detail !== 0) return;
						event.preventDefault();
						whiteboardActions.get(editor)!.onOpenTicket(ticket.id);
					}}
				>
					<span className="sr-only">Open {ticket.label}</span>
				</a>
				{ticket.content}
				{!ticket.matched && <span className="text-xs text-fg-muted">Outside current filters</span>}
			</div>
		</HTMLContainer>
	);
}

export class TicketShapeUtil extends BaseBoxShapeUtil<TicketShape> {
	static override type = "trellis-ticket" as const;
	static override props = { w: T.number, h: T.number, recordId: T.string };
	getDefaultProps() {
		return { w: 320, h: 224, recordId: "" };
	}
	override canEdit() {
		return false;
	}
	override canResize() {
		return false;
	}
	override canReceiveNewChildrenOfType() {
		return false;
	}
	override hideRotateHandle() {
		return true;
	}
	component(shape: TicketShape) {
		return <TicketShapeContent shape={shape} />;
	}
	getIndicatorPath(shape: TicketShape) {
		const path = new Path2D();
		path.rect(0, 0, shape.props.w, shape.props.h);
		return path;
	}
	override onClick(shape: TicketShape) {
		if (this.editor.inputs.getShiftKey() || this.editor.inputs.getAccelKey()) return;
		whiteboardActions.get(this.editor)!.onOpenTicket(shape.props.recordId);
	}
}
