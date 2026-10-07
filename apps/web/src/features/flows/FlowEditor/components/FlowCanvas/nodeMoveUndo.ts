import type { CanvasEdge, CanvasNode } from "../../flowDraft";

type NodeMoveSnapshot = {
	node: Pick<CanvasNode, "id" | "position" | "parentId" | "extent">;
	removedEdges: CanvasEdge[];
};

export const nodeMoveUndo = (snapshot: NodeMoveSnapshot) => ({
	nodes: (current: CanvasNode[]) =>
		current.map((node) =>
			node.id === snapshot.node.id
				? {
						...node,
						position: snapshot.node.position,
						parentId: snapshot.node.parentId,
						extent: snapshot.node.extent,
					}
				: node,
		),
	edges: (current: CanvasEdge[], nodes: CanvasNode[]) => {
		const edgeIds = new Set(current.map((edge) => edge.id));
		const nodeIds = new Set(nodes.map((node) => node.id));
		return [
			...current,
			...snapshot.removedEdges.filter(
				(edge) => !edgeIds.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target),
			),
		];
	},
});
