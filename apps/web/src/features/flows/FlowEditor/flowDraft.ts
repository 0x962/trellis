import {
	entryNodes,
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
import { absolutePosition, BOX_SIZE, boxAt, CARD_SIZE, sizeOf, sortParentsFirst } from "./canvasGeometry";

// The editor keeps the graph as React Flow nodes and edges. React Flow owns
// the position of a node, the box that holds it (`parentId`), and the size of
// a box. `data.fields` holds every other field of the flow node. A box is a
// budget or a loop node, drawn as a rectangle that holds other nodes.
//
// Every card and box has a handle on each side. A handle id starts with the
// output it stands for: `yes-` and `no-` on a gate, `out-` on every other
// kind. An edge stores only its output, and the canvas draws it between the
// two sides of its nodes that face each other.

export type StepFields = Omit<FlowNodeInput, "x" | "y" | "parentId" | "width" | "height">;
export type CanvasNode = Node<{ fields: StepFields }, "step" | "box">;
export type CanvasEdge = Edge<{ branch: FlowBranch }>;
export type DraftGraph = { nodes: FlowNodeInput[]; edges: FlowEdgeInput[] };

// The room a box keeps between its outline and a node inside it. The top
// keeps extra room for the title row of the box.
export const BOX_PAD = { side: 24, top: 48, bottom: 24 };
// The drag type the palette writes and the canvas reads on a drop.
export const KIND_MIME = "application/x-trellis-flow-kind";
// The space between a node and the node a click adds below it.
const FOLLOW_GAP = 72;

const titles: Record<FlowNodeKind, string> = {
	agent: "New agent",
	gate: "New gate",
	human: "Ask a person",
	budget: "Time budget",
	loop: "Loop",
};

const edgeLabels: Record<FlowBranch, string | undefined> = { out: undefined, yes: "Yes", no: "No" };

export const branchOf = (handleId: string | null | undefined): FlowBranch =>
	handleId?.startsWith("yes") ? "yes" : handleId?.startsWith("no") ? "no" : "out";

export const newFields = (kind: FlowNodeKind): StepFields => ({
	id: ulid(),
	kind,
	title: titles[kind],
	personaId: null,
	instruction: "",
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

// The edge draws its own ends, so it names no handle.
export const canvasEdge = (edge: FlowEdgeInput): CanvasEdge => ({
	id: edge.id,
	type: "flow",
	source: edge.fromNodeId,
	target: edge.toNodeId,
	sourceHandle: null,
	targetHandle: null,
	label: edgeLabels[edge.branch],
	data: { branch: edge.branch },
});

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
		branch: branchOf(connection.sourceHandle),
	};
	return !validateFlowGraph({ nodes: graph.nodes, edges: [...graph.edges, edge] }).some((issue) => issue.edgeId === id);
};

// The one step a wire into a box draws to, and the one step a wire out of a
// box draws from. A box with two entry steps or two last steps is absent from
// the map, and its wires draw to its outline.
export const boxEnds = (graph: DraftGraph) => {
	const entryOf = new Map<string, string>();
	const exitOf = new Map<string, string>();
	for (const box of graph.nodes) {
		if (!flowGroupKinds.has(box.kind)) continue;
		const inside = new Set(graph.nodes.filter((node) => node.parentId === box.id).map((node) => node.id));
		const entries = entryNodes(graph, box.id);
		const sources = new Set(graph.edges.filter((edge) => inside.has(edge.toNodeId)).map((edge) => edge.fromNodeId));
		const exits = [...inside].filter((id) => !sources.has(id));
		if (entries.length === 1) entryOf.set(box.id, entries[0]!);
		if (exits.length === 1) exitOf.set(box.id, exits[0]!);
	}
	return { entryOf, exitOf };
};

// The newest node of one scope. A node id is a ULID, and a ULID sorts by the
// time it was made.
const newestIn = (nodes: CanvasNode[], boxId: string | null) => {
	let newest: CanvasNode | undefined;
	for (const node of nodes)
		if ((node.parentId ?? null) === boxId && (newest === undefined || node.id > newest.id)) newest = node;
	return newest;
};

// Adds a node of `kind` and connects it from the node before it. The node
// before it is the selected node when that node sits in the same scope, and
// else the newest node of the scope. A gate connects the new node by YES.
//
// A drop places the node at `drop`, inside the box under that point. A click
// places it below the node before it, or at `center` when the scope is empty.
// A click while a box is selected adds the node inside that box. A box grows
// to hold a node that does not fit. The new node is the only selected node. A
// new box comes with an agent step inside it, the step the box starts at.
export const addNode = (
	nodes: CanvasNode[],
	edges: CanvasEdge[],
	kind: FlowNodeKind,
	place: { drop: XYPosition } | { center: XYPosition },
) => {
	const picked = nodes.filter((node) => node.selected);
	const selected = picked.length === 1 ? picked[0] : undefined;
	const boxId =
		"drop" in place
			? boxAt(nodes, place.drop, null)
			: selected?.type === "box"
				? selected.id
				: (selected?.parentId ?? null);
	const previous =
		selected !== undefined && selected.id !== boxId && (selected.parentId ?? null) === boxId
			? selected
			: newestIn(nodes, boxId);
	const size = flowGroupKinds.has(kind) ? BOX_SIZE : CARD_SIZE;
	const origin = boxId === null ? { x: 0, y: 0 } : absolutePosition(nodes, boxId);
	const inBox = (x: number) => (boxId === null ? x : Math.max(x, BOX_PAD.side));
	const position =
		"drop" in place
			? { x: place.drop.x - origin.x, y: place.drop.y - origin.y }
			: previous !== undefined
				? {
						x: inBox(previous.position.x + (sizeOf(previous).width - size.width) / 2),
						y: previous.position.y + sizeOf(previous).height + FOLLOW_GAP,
					}
				: boxId !== null
					? { x: BOX_PAD.side, y: BOX_PAD.top }
					: { x: place.center.x - size.width / 2, y: place.center.y - size.height / 2 };
	const fields = newFields(kind);
	const node = { ...canvasNode(fields, position, boxId, flowGroupKinds.has(kind) ? BOX_SIZE : null), selected: true };
	const others = nodes.map((item) => {
		if (item.id !== boxId) return item.selected ? { ...item, selected: false } : item;
		const box = sizeOf(item);
		return {
			...item,
			selected: false,
			width: Math.max(box.width, position.x + size.width + BOX_PAD.side),
			height: Math.max(box.height, position.y + size.height + BOX_PAD.bottom),
		};
	});
	const entry = flowGroupKinds.has(kind)
		? [canvasNode(newFields("agent"), { x: (BOX_SIZE.width - CARD_SIZE.width) / 2, y: BOX_PAD.top }, node.id, null)]
		: [];
	const nextNodes = sortParentsFirst([...others, node, ...entry]);
	if (previous === undefined) return { nodes: nextNodes, edges, id: node.id };
	const branch = previous.data.fields.kind === "gate" ? "yes" : "out";
	const edge = canvasEdge({ id: ulid(), fromNodeId: previous.id, toNodeId: node.id, branch });
	const fits = canConnect(fromCanvas(nextNodes, edges), { source: previous.id, target: node.id, sourceHandle: branch });
	return { nodes: nextNodes, edges: fits ? [...edges, edge] : edges, id: node.id };
};

// Moves a node into a box, or onto the canvas when `boxId` is null. The node
// keeps its place on screen, so its position changes to the new origin. An
// edge stays inside one box, so every edge that now crosses the outline of a
// box goes, and `removed` counts them.
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
