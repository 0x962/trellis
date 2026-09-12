import { type FlowEdgeInput, type FlowNodeInput, flowAgentKinds, flowGroupKinds } from "./schemas/flow.ts";

// The fields of a flow graph that decide whether the graph is valid. The
// server checks a graph with `validateFlowGraph` before a save writes it, and
// the web editor shows the same issues while a person draws.
export type FlowGraphNode = Pick<FlowNodeInput, "id" | "parentId" | "kind" | "personaId" | "instruction">;
export type FlowGraphEdge = Pick<FlowEdgeInput, "id" | "fromNodeId" | "toNodeId" | "branch">;
export type FlowGraph = { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] };

export type FlowIssueCode =
	| "duplicate-id"
	| "unknown-parent"
	| "parent-not-group"
	| "parent-cycle"
	| "unknown-node"
	| "self-edge"
	| "duplicate-edge"
	| "branch-kind"
	| "cross-group-edge"
	| "cycle"
	| "empty-prompt";

// `nodeId` or `edgeId` names the row the issue is about.
export type FlowIssue = { code: FlowIssueCode; nodeId?: string; edgeId?: string; message: string };

export const validateFlowGraph = (graph: FlowGraph): FlowIssue[] => {
	const issues: FlowIssue[] = [];
	const nodes = new Map<string, FlowGraphNode>();
	const ids = new Set<string>();
	for (const row of [...graph.nodes, ...graph.edges]) {
		if (ids.has(row.id)) issues.push({ code: "duplicate-id", message: `Two rows use the id ${row.id}.` });
		ids.add(row.id);
	}
	for (const node of graph.nodes) nodes.set(node.id, node);

	for (const node of graph.nodes) {
		if (node.parentId === null) continue;
		const parent = nodes.get(node.parentId);
		if (parent === undefined) {
			issues.push({
				code: "unknown-parent",
				nodeId: node.id,
				message: "The node is inside a group that does not exist.",
			});
		} else if (!flowGroupKinds.has(parent.kind)) {
			issues.push({ code: "parent-not-group", nodeId: node.id, message: "Only a budget or a loop can hold nodes." });
		} else if (insideItself(nodes, node)) {
			issues.push({ code: "parent-cycle", nodeId: node.id, message: "The group is inside itself." });
		}
	}

	const seen = new Set<string>();
	const valid: FlowGraphEdge[] = [];
	for (const edge of graph.edges) {
		const from = nodes.get(edge.fromNodeId);
		const to = nodes.get(edge.toNodeId);
		if (from === undefined || to === undefined) {
			issues.push({
				code: "unknown-node",
				edgeId: edge.id,
				message: "The connection names a node that does not exist.",
			});
			continue;
		}
		if (from.id === to.id) {
			issues.push({ code: "self-edge", edgeId: edge.id, message: "A node cannot connect to itself." });
			continue;
		}
		const key = `${edge.fromNodeId} ${edge.branch} ${edge.toNodeId}`;
		if (seen.has(key)) {
			issues.push({ code: "duplicate-edge", edgeId: edge.id, message: "The two nodes are already connected." });
			continue;
		}
		seen.add(key);
		if ((from.kind === "gate") !== (edge.branch !== "out")) {
			issues.push({
				code: "branch-kind",
				edgeId: edge.id,
				message: from.kind === "gate" ? "A gate connects from YES or NO." : "Only a gate connects from YES or NO.",
			});
			continue;
		}
		if (from.parentId !== to.parentId) {
			issues.push({
				code: "cross-group-edge",
				edgeId: edge.id,
				message: "A connection stays inside one group. Connect to the group instead.",
			});
			continue;
		}
		valid.push(edge);
	}
	for (const edge of backEdges(graph.nodes, valid)) {
		issues.push({
			code: "cycle",
			edgeId: edge.id,
			message: "The connection makes a loop. Use a loop group to repeat steps.",
		});
	}

	for (const node of graph.nodes) {
		const blank = node.instruction.trim() === "";
		if (node.kind === "human" && blank) {
			issues.push({ code: "empty-prompt", nodeId: node.id, message: "Write what the person must decide." });
		} else if (flowAgentKinds.has(node.kind) && blank && node.personaId === null) {
			issues.push({ code: "empty-prompt", nodeId: node.id, message: "Select a persona or write an instruction." });
		}
	}
	return issues;
};

// True when the chain of parents from `node` comes back to `node`.
const insideItself = (nodes: Map<string, FlowGraphNode>, node: FlowGraphNode) => {
	const visited = new Set<string>();
	let current = node.parentId;
	while (current !== null && !visited.has(current)) {
		if (current === node.id) return true;
		visited.add(current);
		current = nodes.get(current)?.parentId ?? null;
	}
	return false;
};

// The edges that close a loop: a depth-first walk in input order reaches each
// one while its target node is still on the walk. Removing these edges leaves
// a graph with no loop.
const backEdges = (nodes: FlowGraphNode[], edges: FlowGraphEdge[]) => {
	const outgoing = new Map<string, FlowGraphEdge[]>();
	for (const edge of edges) outgoing.set(edge.fromNodeId, [...(outgoing.get(edge.fromNodeId) ?? []), edge]);
	const state = new Map<string, "open" | "done">();
	const found: FlowGraphEdge[] = [];
	const visit = (id: string) => {
		state.set(id, "open");
		for (const edge of outgoing.get(id) ?? []) {
			const next = state.get(edge.toNodeId);
			if (next === "open") found.push(edge);
			else if (next === undefined) visit(edge.toNodeId);
		}
		state.set(id, "done");
	};
	for (const node of nodes) if (!state.has(node.id)) visit(node.id);
	return found;
};

// The nodes of one scope that start when the scope starts: the nodes with
// `parentId` equal to `parentId` and no incoming edge. `null` is the scope
// outside every group.
export const entryNodes = (graph: FlowGraph, parentId: string | null) => {
	const targets = new Set(graph.edges.map((edge) => edge.toNodeId));
	return graph.nodes.filter((node) => node.parentId === parentId && !targets.has(node.id)).map((node) => node.id);
};
