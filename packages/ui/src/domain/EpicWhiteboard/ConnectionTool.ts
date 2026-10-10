import { StateNode, type TLPointerEventInfo } from "tldraw";
import { type TicketShape, whiteboardActions } from "./types";

export class ConnectionTool extends StateNode {
	static override id = "connection";
	private source: TicketShape | null = null;
	private pressed = false;

	private ticketAtPointer() {
		const shape = this.editor.getShapeAtPoint(this.editor.inputs.getCurrentPagePoint(), {
			filter: (entry) => entry.type === "trellis-ticket",
			hitInside: true,
		});
		return shape?.type === "trellis-ticket" ? shape : null;
	}

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
	}

	override onPointerDown(info: TLPointerEventInfo) {
		if (info.button !== 0 || this.editor.getIsReadonly()) return;
		this.pressed = true;
		this.source ??= this.ticketAtPointer();
		this.editor.setHintingShapes(this.source ? [this.source.id] : []);
	}

	override onPointerMove() {
		const target = this.ticketAtPointer();
		this.editor.setHintingShapes([...(this.source ? [this.source.id] : []), ...(target ? [target.id] : [])]);
	}

	override onPointerUp() {
		if (!this.pressed) return;
		this.pressed = false;
		const source = this.source;
		const target = this.ticketAtPointer();
		if (this.editor.getIsReadonly() || !source || !target) {
			this.editor.setCurrentTool("select");
			return;
		}
		if (source.id === target.id) return;
		this.editor.setCurrentTool("select");
		whiteboardActions.get(this.editor)!.onConnectTickets(source.props.recordId, target.props.recordId);
	}

	override onCancel() {
		this.editor.setCurrentTool("select");
	}

	override onExit() {
		this.source = null;
		this.pressed = false;
		this.editor.setHintingShapes([]);
	}
}
