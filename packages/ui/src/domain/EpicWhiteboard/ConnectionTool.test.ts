import { expect, test } from "bun:test";
import type { Editor, TLPointerEventInfo } from "tldraw";
import { ConnectionTool } from "./ConnectionTool";
import { type TicketShape, type WhiteboardActions, whiteboardActions } from "./types";

const pointer = { button: 0 } as TLPointerEventInfo;
const shape = (id: string) => ({ id: `shape:${id}`, type: "trellis-ticket", props: { recordId: id } }) as TicketShape;

function fixture() {
	let target: TicketShape | null = null;
	let readOnly = false;
	const connections: string[][] = [];
	const modes: string[] = [];
	let tool!: ConnectionTool;
	const editor = {
		inputs: { getCurrentPagePoint: () => ({ x: 0, y: 0 }) },
		getShapeAtPoint: () => target,
		getIsReadonly: () => readOnly,
		setHintingShapes: () => {},
		setCursor: () => {},
		setCurrentTool: (mode: string) => {
			modes.push(mode);
			tool.onExit();
		},
	} as unknown as Editor;
	tool = new ConnectionTool(editor);
	whiteboardActions.set(editor, {
		onConnectTickets: (source: string, target: string) => {
			connections.push([source, target]);
		},
	} as unknown as WhiteboardActions);
	tool.onEnter();
	return {
		tool,
		connections,
		modes,
		target: (id: string | null) => {
			target = id ? shape(id) : null;
		},
		readOnly: () => {
			readOnly = true;
		},
	};
}

test("a drag connects the prerequisite to the dependent once", () => {
	const f = fixture();
	f.target("prerequisite");
	f.tool.onPointerDown(pointer);
	f.target("dependent");
	f.tool.onPointerMove();
	f.tool.onPointerUp();
	f.tool.onPointerUp();
	expect(f.connections).toEqual([["prerequisite", "dependent"]]);
	expect(f.modes).toEqual(["select"]);
});

test("two clicks connect tickets without a self-dependency", () => {
	const f = fixture();
	f.target("prerequisite");
	f.tool.onPointerDown(pointer);
	f.tool.onPointerUp();
	expect(f.connections).toEqual([]);
	f.target("dependent");
	f.tool.onPointerDown(pointer);
	f.tool.onPointerUp();
	expect(f.connections).toEqual([["prerequisite", "dependent"]]);
});

test("blank release, Escape, and read-only mode do not create dependencies", () => {
	for (const action of ["blank", "cancel", "readonly"] as const) {
		const f = fixture();
		f.target("prerequisite");
		f.tool.onPointerDown(pointer);
		f.target("dependent");
		if (action === "blank") f.target(null);
		if (action === "cancel") f.tool.onCancel();
		if (action === "readonly") f.readOnly();
		f.tool.onPointerUp();
		expect(f.connections).toEqual([]);
	}
});
