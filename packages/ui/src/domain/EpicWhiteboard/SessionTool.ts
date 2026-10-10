import { StateNode, type TLPointerEventInfo } from "tldraw";
import { type WhiteboardPoint, whiteboardActions } from "./types";

export class SessionTool extends StateNode {
	static override id = "session";
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
		this.editor.setCurrentTool("select");
		whiteboardActions.get(this.editor)!.onCreateSession(point);
	}

	override onCancel() {
		this.editor.setCurrentTool("select");
	}

	override onExit() {
		this.point = null;
	}
}
