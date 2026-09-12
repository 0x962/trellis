import type { XYPosition } from "@xyflow/react";
import type { CanvasNode } from "./flowDraft";

// Positions and sizes of canvas nodes. A node inside a box stores its
// position relative to the box, so a canvas position adds up the chain of
// boxes that hold it.

export const BOX_SIZE = { width: 360, height: 220 };
// The size a card draws at before React Flow measures it.
export const CARD_SIZE = { width: 224, height: 56 };

export const sizeOf = (node: CanvasNode) => {
	const fallback = node.type === "box" ? BOX_SIZE : CARD_SIZE;
	return {
		width: node.width ?? node.measured?.width ?? fallback.width,
		height: node.height ?? node.measured?.height ?? fallback.height,
	};
};

const depthOf = (byId: Map<string, CanvasNode>, node: CanvasNode) => {
	let depth = 0;
	for (let current = node; current.parentId !== undefined; current = byId.get(current.parentId)!) depth++;
	return depth;
};

// React Flow draws a node inside its box only when the box comes first in
// the array. The sort is stable, so nodes at one depth keep their order.
export const sortParentsFirst = (nodes: CanvasNode[]) => {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	return nodes
		.map((node) => ({ node, depth: depthOf(byId, node) }))
		.sort((a, b) => a.depth - b.depth)
		.map((entry) => entry.node);
};

export const absolutePosition = (nodes: CanvasNode[], id: string): XYPosition => {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	let node = byId.get(id)!;
	let { x, y } = node.position;
	while (node.parentId !== undefined) {
		node = byId.get(node.parentId)!;
		x += node.position.x;
		y += node.position.y;
	}
	return { x, y };
};

// True when `outer` is `inner`, or holds `inner` at any depth.
const holds = (byId: Map<string, CanvasNode>, outer: string, inner: string) => {
	for (let current: string | undefined = inner; current !== undefined; current = byId.get(current)?.parentId)
		if (current === outer) return true;
	return false;
};

// The innermost box that contains `point`. The node that moves and the boxes
// inside it never count, so a box never lands inside itself. Null means the
// canvas outside every box.
export const boxAt = (nodes: CanvasNode[], point: XYPosition, movingId: string | null) => {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	let best: { id: string; depth: number } | null = null;
	for (const node of nodes) {
		if (node.type !== "box" || (movingId !== null && holds(byId, movingId, node.id))) continue;
		const corner = absolutePosition(nodes, node.id);
		const { width, height } = sizeOf(node);
		if (point.x < corner.x || point.y < corner.y || point.x > corner.x + width || point.y > corner.y + height) continue;
		const depth = depthOf(byId, node);
		if (best === null || depth > best.depth) best = { id: node.id, depth };
	}
	return best?.id ?? null;
};
