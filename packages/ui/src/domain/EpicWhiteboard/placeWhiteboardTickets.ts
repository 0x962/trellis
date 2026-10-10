import type { Editor } from "tldraw";
import type { WhiteboardTicketPlacement } from "./types";
import { ticketShapeId } from "./whiteboardLayout";

export function placeWhiteboardTickets(editor: Editor, placements: readonly WhiteboardTicketPlacement[]) {
	const placed: string[] = [];
	for (const placement of placements) {
		const shape = editor.getShape(ticketShapeId(placement.ticketId));
		if (!shape) continue;
		const point = editor.getPointInParentSpace(shape, placement);
		editor.updateShape({ id: shape.id, type: shape.type, x: point.x, y: point.y });
		placed.push(placement.ticketId);
	}
	return placed;
}
