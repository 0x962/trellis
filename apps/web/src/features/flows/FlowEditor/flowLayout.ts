import { Graph, layout } from "@dagrejs/dagre";
import { sizeOf } from "./canvasGeometry";
import { BOX_PAD, type CanvasEdge, type CanvasNode } from "./flowDraft";

// The space between two nodes in one row, and between two rows.
const GAP = { node: 48, rank: 72 };
// The smallest box that `tidyLayout` draws, so an empty box stays easy to hit.
const BOX_MIN = { width: 240, height: 120 };
// Every position lands on the 8 px canvas grid. A size rounds up, so a box
// never clips the nodes inside it.
const snap = (value: number) => Math.round(value / 8) * 8;
const snapUp = (value: number) => Math.ceil(value / 8) * 8;

type Placement = { x: number; y: number; width?: number; height?: number };

// Places every node from top to bottom along its edges. Each box gets its own
// layout, the innermost box first. A box then takes the size that holds its
// nodes, so the scope around it places the box as one node of that size.
export const tidyLayout = (nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] => {
	const members = new Map<string | null, CanvasNode[]>();
	for (const node of nodes) {
		const scope = node.parentId ?? null;
		members.set(scope, [...(members.get(scope) ?? []), node]);
	}
	const placed = new Map<string, Placement>();

	// Lays out the nodes of one scope and returns the size of a box that holds them.
	const layOut = (scope: string | null): { width: number; height: number } => {
		const list = members.get(scope) ?? [];
		if (list.length === 0) return BOX_MIN;
		const graph = new Graph();
		graph.setGraph({ rankdir: "TB", nodesep: GAP.node, ranksep: GAP.rank });
		graph.setDefaultEdgeLabel(() => ({}));
		for (const node of list) graph.setNode(node.id, node.type === "box" ? layOut(node.id) : sizeOf(node));
		const ids = new Set(list.map((node) => node.id));
		for (const edge of edges) if (ids.has(edge.source) && ids.has(edge.target)) graph.setEdge(edge.source, edge.target);
		layout(graph);
		const offset = scope === null ? { x: 0, y: 0 } : { x: BOX_PAD.side, y: BOX_PAD.top };
		for (const node of list) {
			const box = graph.node(node.id);
			placed.set(node.id, {
				x: snap(box.x - box.width / 2 + offset.x),
				y: snap(box.y - box.height / 2 + offset.y),
				...(node.type === "box" ? { width: snapUp(box.width), height: snapUp(box.height) } : {}),
			});
		}
		const size = graph.graph();
		return {
			width: snapUp(Math.max((size.width ?? 0) + 2 * BOX_PAD.side, BOX_MIN.width)),
			height: snapUp(Math.max((size.height ?? 0) + BOX_PAD.top + BOX_PAD.bottom, BOX_MIN.height)),
		};
	};

	layOut(null);
	return nodes.map((node) => {
		const place = placed.get(node.id)!;
		return {
			...node,
			position: { x: place.x, y: place.y },
			...(place.width === undefined ? {} : { width: place.width, height: place.height }),
		};
	});
};
