import { expect, test } from "bun:test";
import type { Editor, TLPointerEventInfo } from "tldraw";
import { SessionTool } from "./SessionTool";
import { TicketTool } from "./TicketTool";
import { type WhiteboardActions, type WhiteboardPoint, whiteboardActions } from "./types";

function fixture(kind: "ticket" | "session") {
	const point = { x: 280, y: -64 };
	const opened: { point: WhiteboardPoint; waveId?: string | null }[] = [];
	let dragging = false;
	let readOnly = false;
	let tool: TicketTool | SessionTool;
	const editor = {
		inputs: { getCurrentPagePoint: () => point, getIsDragging: () => dragging },
		getIsReadonly: () => readOnly,
		getShapeAtPoint: () => ({ type: "trellis-wave", props: { recordId: "wave" } }),
		setCursor: () => {},
		setCurrentTool: () => {
			tool.onExit();
		},
	} as unknown as Editor;
	whiteboardActions.set(editor, {
		onCreateTicket: (point, waveId) => {
			opened.push({ point, waveId });
		},
		onCreateSession: (point) => {
			opened.push({ point });
		},
	} as WhiteboardActions);
	tool = kind === "ticket" ? new TicketTool(editor) : new SessionTool(editor);
	return {
		tool,
		point,
		opened,
		drag: () => {
			dragging = true;
		},
		archive: () => {
			readOnly = true;
		},
	};
}

for (const kind of ["ticket", "session"] as const) {
	test(`${kind} placement copies the page point and opens once after a tap`, () => {
		const f = fixture(kind);
		f.tool.onPointerDown({ button: 0 } as TLPointerEventInfo);
		f.point.x = 281;
		f.tool.onPointerUp();
		f.tool.onPointerUp();
		expect(f.opened).toEqual([{ point: { x: 280, y: -64 }, ...(kind === "ticket" ? { waveId: "wave" } : {}) }]);
	});

	test(`${kind} placement ignores canceled taps, pans, right clicks, and archive changes`, () => {
		for (const action of ["cancel", "drag", "archive", "right"] as const) {
			const f = fixture(kind);
			f.tool.onPointerDown({ button: action === "right" ? 2 : 0 } as TLPointerEventInfo);
			if (action === "cancel") f.tool.onCancel();
			if (action === "drag") f.drag();
			if (action === "archive") f.archive();
			f.tool.onPointerUp();
			expect(f.opened).toEqual([]);
		}
	});
}
