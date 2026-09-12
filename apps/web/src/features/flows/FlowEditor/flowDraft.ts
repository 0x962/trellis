import {
	type FlowBranch,
	type FlowEdge,
	type FlowEdgeInput,
	type FlowNode,
	type FlowNodeInput,
	type FlowNodeKind,
	FlowSaveInputSchema,
	flowGroupKinds,
	validateFlowGraph,
} from "@trellis/api";
import type { Edge, Node, XYPosition } from "@xyflow/react";
import { ulid } from "ulid";

// The editor keeps the graph as React Flow nodes and edges. React Flow owns
// the position of a node, the box that holds it (`parentId`), and the size of
// a box. `data.fields` holds every other field of the flow node. A box is a
// budget or a loop node, drawn as a rectangle that holds other nodes.

export type StepFields = Omit<FlowNodeInput, "x" | "y" | "parentId" | "width" | "height">;
export type CanvasNode = Node<{ fields: StepFields }, "step" | "box">;
export type CanvasEdge = Edge<{ branch: FlowBranch }>;
export type DraftGraph = { nodes: FlowNodeInput[]; edges: FlowEdgeInput[] };

export const BOX_SIZE = { width: 360, height: 220 };
// The size a card draws at before React Flow measures it.
export const CARD_SIZE = { width: 224, height: 56 };
// The drag type the palette writes and the canvas reads on a drop.
export const KIND_MIME = "application/x-trellis-flow-kind";

const titles: Record<FlowNodeKind, string> = {
	agent: "New agent",
	gate: "New gate",
	human: "Ask a person",
	budget: "Time budget",
	loop: "Loop",
};

const edgeLabels: Record<FlowBranch, string | undefined> = { out: undefined, yes: "Yes", no: "No" };

export const newFields = (kind: FlowNodeKind): StepFields => ({
	id: ulid(),
	kind,
	title: titles[kind],
	personaId: null,
	instruction: "",
	model: null,
	effort: null,
	minutes: kind === "budget" ? 10 : null,
	maxRounds: kind === "loop" ? 3 : null,
});

const canvasNode = (
	fields: StepFields,
	position: XYPosition,
	parentId: string | null,
	size: { width: number; height: number } | null,
): CanvasNode => ({
	id: fields.id,
	type: flowGroupKinds.has(fields.kind) ? "box" : "step",
	position,
	...(parentId === null ? {} : { parentId }),
	...(size === null ? {} : { width: size.width, height: size.height }),
	data: { fields },
});

export const canvasEdge = (edge: FlowEdgeInput): CanvasEdge => ({
	id: edge.id,
	type: "smoothstep",
	source: edge.fromNodeId,
	target: edge.toNodeId,
	sourceHandle: edge.branch,
	targetHandle: "in",
	label: edgeLabels[edge.branch],
	data: { branch: edge.branch },
});

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

export const toCanvas = (doc: { nodes: FlowNode[]; edges: FlowEdge[] }) => ({
	nodes: sortParentsFirst(
		doc.nodes.map(({ x, y, parentId, width, height, ...fields }) =>
			canvasNode(
				fields,
				{ x, y },
				parentId,
				flowGroupKinds.has(fields.kind) ? { width: width ?? BOX_SIZE.width, height: height ?? BOX_SIZE.height } : null,
			),
		),
	),
	edges: doc.edges.map(canvasEdge),
});

export const fromCanvas = (nodes: CanvasNode[], edges: CanvasEdge[]): DraftGraph => ({
	nodes: nodes.map((node) => ({
		...node.data.fields,
		parentId: node.parentId ?? null,
		x: node.position.x,
		y: node.position.y,
		width: node.type === "box" ? (node.width ?? BOX_SIZE.width) : null,
		height: node.type === "box" ? (node.height ?? BOX_SIZE.height) : null,
	})),
	edges: edges.map((edge) => ({
		id: edge.id,
		fromNodeId: edge.source,
		toNodeId: edge.target,
		branch: edge.data!.branch,
	})),
});

// The first message for each node and edge, from the graph rules and the save
// schema. `count` also counts an issue that names no row, because the server
// refuses a save with any issue.
export const draftIssues = (flowId: string, graph: DraftGraph) => {
	const byRow = new Map<string, string>();
	let count = 0;
	const note = (id: string | undefined, message: string) => {
		count++;
		if (id !== undefined && !byRow.has(id)) byRow.set(id, message);
	};
	for (const issue of validateFlowGraph(graph)) note(issue.nodeId ?? issue.edgeId, issue.message);
	const parsed = FlowSaveInputSchema.safeParse({ flow: flowId, ...graph });
	if (!parsed.success)
		for (const issue of parsed.error.issues) {
			const [list, index] = issue.path;
			const rows: readonly { id: string }[] = list === "nodes" ? graph.nodes : list === "edges" ? graph.edges : [];
			note(rows[index as number]?.id, issue.message);
		}
	return { byRow, count };
};

export const edgesWithIssues = (edges: CanvasEdge[], byRow: Map<string, string>) =>
	edges.map((edge) => (byRow.has(edge.id) ? { ...edge, className: "flow-edge-issue" } : edge));

// True when the connection passes every edge rule of `validateFlowGraph`,
// so the canvas refuses a connection that the server would refuse.
export const canConnect = (
	graph: DraftGraph,
	connection: { source: string; target: string; sourceHandle?: string | null },
) => {
	const id = "candidate";
	const edge = {
		id,
		fromNodeId: connection.source,
		toNodeId: connection.target,
		branch: (connection.sourceHandle ?? "out") as FlowBranch,
	};
	return !validateFlowGraph({ nodes: graph.nodes, edges: [...graph.edges, edge] }).some((issue) => issue.edgeId === id);
};

// The canvas position of a node: its own position plus the position of each
// box that holds it.
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
		const width = node.width ?? BOX_SIZE.width;
		const height = node.height ?? BOX_SIZE.height;
		if (point.x < corner.x || point.y < corner.y || point.x > corner.x + width || point.y > corner.y + height) continue;
		const depth = depthOf(byId, node);
		if (best === null || depth > best.depth) best = { id: node.id, depth };
	}
	return best?.id ?? null;
};

// Adds a node of `kind` with its top left corner at `point`, inside the box
// under that point. The new node is the only selected node.
export const addNode = (nodes: CanvasNode[], kind: FlowNodeKind, point: XYPosition) => {
	const boxId = boxAt(nodes, point, null);
	const origin = boxId === null ? { x: 0, y: 0 } : absolutePosition(nodes, boxId);
	const fields = newFields(kind);
	const node = canvasNode(
		fields,
		{ x: point.x - origin.x, y: point.y - origin.y },
		boxId,
		flowGroupKinds.has(kind) ? BOX_SIZE : null,
	);
	const others = nodes.map((item) => (item.selected ? { ...item, selected: false } : item));
	return { nodes: sortParentsFirst([...others, { ...node, selected: true }]), id: node.id };
};

// Moves a node into a box, or onto the canvas when `boxId` is null. The node
// keeps its place on screen, so its position changes to the new origin. An
// edge stays inside one box, so every edge that now crosses the edge of a box
// goes, and `removed` counts them.
export const moveIntoBox = (nodes: CanvasNode[], edges: CanvasEdge[], id: string, boxId: string | null) => {
	const screen = absolutePosition(nodes, id);
	const origin = boxId === null ? { x: 0, y: 0 } : absolutePosition(nodes, boxId);
	const moved = nodes.map((node) => {
		if (node.id !== id) return node;
		const { parentId: _old, ...rest } = node;
		return {
			...rest,
			position: { x: screen.x - origin.x, y: screen.y - origin.y },
			...(boxId === null ? {} : { parentId: boxId }),
		};
	});
	const parentOf = new Map(moved.map((node) => [node.id, node.parentId ?? null]));
	const kept = edges.filter((edge) => parentOf.get(edge.source) === parentOf.get(edge.target));
	return { nodes: sortParentsFirst(moved), edges: kept, removed: edges.length - kept.length };
};
