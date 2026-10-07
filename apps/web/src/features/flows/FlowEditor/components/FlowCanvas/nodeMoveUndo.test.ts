import { expect, test } from "bun:test";
import type { CanvasEdge, CanvasNode } from "../../flowDraft";
import { nodeMoveUndo } from "./nodeMoveUndo";

const moved = {
	id: "node-1",
	parentId: "box-1",
	position: { x: 24, y: 48 },
	data: { fields: { id: "node-1" } },
} as CanvasNode;
const before = {
	...moved,
	parentId: undefined,
	position: { x: 400, y: 240 },
} as CanvasNode;
const removed = { id: "edge-1", source: "node-1", target: "node-2" } as CanvasEdge;

test("restores the moved node and removed connections without replacing later edits", () => {
	const undo = nodeMoveUndo({ node: before, removedEdges: [removed] });
	const other = {
		id: "node-2",
		position: { x: 80, y: 96 },
		data: { fields: { id: "node-2" } },
	} as CanvasNode;
	const changedOther = { ...other, position: { x: 88, y: 104 } };
	expect(undo.nodes([moved, changedOther])).toEqual([before, changedOther]);

	const later = { id: "edge-2", source: "node-2", target: "node-3" } as CanvasEdge;
	expect(undo.edges([later])).toEqual([later, removed]);
});

test("does not add the same connection twice", () => {
	const undo = nodeMoveUndo({ node: before, removedEdges: [removed] });
	expect(undo.edges([removed])).toEqual([removed]);
});
