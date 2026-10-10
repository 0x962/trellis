import { createShapeId, type Editor } from "tldraw";
import type { WhiteboardSessionPlacement } from "./types";

export const sessionShapeId = (id: string) => createShapeId(`session-${id}`);

export function placeWhiteboardSessions(editor: Editor, placements: readonly WhiteboardSessionPlacement[]) {
	for (const { x, y, runId, sessionId, label } of placements) {
		if (editor.getShape(sessionShapeId(runId))) continue;
		editor.createShape({
			id: sessionShapeId(runId),
			type: "trellis-session",
			x,
			y,
			props: { runId, sessionId, label, w: 160, h: 112 },
		});
	}
	return placements.map((entry) => entry.runId);
}
