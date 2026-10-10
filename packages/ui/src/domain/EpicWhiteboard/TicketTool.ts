import { StateNode, type TLPointerEventInfo } from "tldraw";
import { type WhiteboardPoint, whiteboardActions } from "./types";

export class TicketTool extends StateNode {
	static override id = "ticket";
	private point: WhiteboardPoint | null = null;

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
	}

	override onPointerDown(info: TLPointerEventInfo) {
		if (info.button !== 0) return;
		const { x, y } = this.editor.inputs.getCurrentPagePoint();
		this.point = { x, y };
	}

	override onPointerUp() {
		const point = this.point;
		this.point = null;
		if (!point || this.editor.inputs.getIsDragging() || this.editor.getIsReadonly()) return;
		const wave = this.editor.getShapeAtPoint(point, {
			filter: (shape) => shape.type === "trellis-wave",
			hitInside: true,
		});
		this.editor.setCurrentTool("select");
		whiteboardActions
			.get(this.editor)!
			.onCreateTicket(point, wave?.type === "trellis-wave" ? wave.props.recordId : null);
	}

	override onCancel() {
		this.editor.setCurrentTool("select");
	}

	override onExit() {
		this.point = null;
	}
}
