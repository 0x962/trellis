import type { CanvasEdge, CanvasNode } from "../../flowDraft";

type NodeMoveSnapshot = {
	node: CanvasNode;
	removedEdges: CanvasEdge[];
};

export const nodeMoveUndo = (snapshot: NodeMoveSnapshot) => ({
	nodes: (current: CanvasNode[]) => current.map((node) => (node.id === snapshot.node.id ? snapshot.node : node)),
	edges: (current: CanvasEdge[]) => {
		const ids = new Set(current.map((edge) => edge.id));
		return [...current, ...snapshot.removedEdges.filter((edge) => !ids.has(edge.id))];
	},
});
