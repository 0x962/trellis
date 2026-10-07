import { expect, test } from "bun:test";
import type { CanvasEdge, CanvasNode } from "../../flowDraft";
import { nodeMoveUndo } from "./nodeMoveUndo";

const moved = {
	id: "node-1",
	parentId: "box-1",
	extent: "parent",
	position: { x: 24, y: 48 },
	data: { fields: { id: "node-1", title: "Moved" } },
} as CanvasNode;
const before = {
	...moved,
	parentId: undefined,
	extent: undefined,
	position: { x: 400, y: 240 },
} as CanvasNode;
const other = {
	id: "node-2",
	position: { x: 80, y: 96 },
	data: { fields: { id: "node-2" } },
} as CanvasNode;
const removed = { id: "edge-1", source: "node-1", target: "node-2" } as CanvasEdge;

test("restores only the move fields and preserves later node edits", () => {
	const undo = nodeMoveUndo({ node: before, removedEdges: [removed] });
	const editedMoved = { ...moved, data: { fields: { id: "node-1", title: "Edited after move" } } } as CanvasNode;
	const changedOther = { ...other, position: { x: 88, y: 104 } };

	expect(undo.nodes([editedMoved, changedOther])).toEqual([
		{ ...editedMoved, position: before.position, parentId: before.parentId, extent: before.extent },
		changedOther,
	]);
});

test("restores a removed connection only while both endpoint nodes exist", () => {
	const undo = nodeMoveUndo({ node: before, removedEdges: [removed] });
	const nodes = undo.nodes([moved, other]);
	expect(undo.edges([], nodes)).toEqual([removed]);
	expect(
		undo.edges(
			[],
			nodes.filter((node) => node.id !== "node-2"),
		),
	).toEqual([]);
});

test("does not add the same connection twice", () => {
	const undo = nodeMoveUndo({ node: before, removedEdges: [removed] });
	expect(undo.edges([removed], [moved, other])).toEqual([removed]);
});
