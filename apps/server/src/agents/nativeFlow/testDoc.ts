import type { FlowDoc, FlowEdge, FlowNode } from "@trellis/api";

// A saved flow for the engine tests: the nodes and the edges as given, with
// a fixed flow header.
export const flowDoc = (nodes: FlowNode[], edges: FlowEdge[]): FlowDoc => ({
	flow: {
		id: "flow",
		project: null,
		slug: "review",
		name: "Review",
		description: "",
		briefing: "",
		harness: null,
		version: 1,
		createdAt: "2026-09-18T00:00:00.000Z",
		updatedAt: "2026-09-18T00:00:00.000Z",
	},
	nodes,
	edges,
});

export const node = (
	id: string,
	kind: FlowNode["kind"],
	parentId: string | null,
	fields: Partial<Pick<FlowNode, "parallel" | "minutes" | "maxRounds" | "title" | "x" | "y">> = {},
): FlowNode => ({
	id,
	parentId,
	kind,
	title: id,
	instruction: "Do the step",
	parallel: false,
	minutes: null,
	maxRounds: kind === "loop" ? 3 : null,
	harness: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	...fields,
});

export const edge = (fromNodeId: string, toNodeId: string, branch: FlowEdge["branch"] = "out"): FlowEdge => ({
	id: `${fromNodeId}-${branch}-${toNodeId}`,
	fromNodeId,
	toNodeId,
	branch,
});
