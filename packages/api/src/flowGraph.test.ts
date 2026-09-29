import { expect, test } from "bun:test";
import { type FlowGraphEdge, type FlowGraphNode, validateFlowGraph } from "./flowGraph.ts";

const node = (id: string): FlowGraphNode => ({
	id,
	parentId: null,
	kind: "agent",
	title: id,
	instruction: "Work.",
	parallel: false,
	reviewArea: null,
});

const edge = (id: string, fromNodeId: string, toNodeId: string): FlowGraphEdge => ({
	id,
	fromNodeId,
	toNodeId,
	branch: "out",
});

test("validates a graph deeper than the JavaScript call stack", () => {
	const nodes = Array.from({ length: 20_000 }, (_, index) => node(`node-${index}`));
	const edges = nodes.slice(1).map((current, index) => edge(`edge-${index}`, nodes[index]!.id, current.id));

	expect(validateFlowGraph({ nodes, edges }, "save")).toEqual([]);
});

test("reports cycle edges in depth-first input order", () => {
	const nodes = [node("a"), node("b"), node("c"), node("d")];
	const edges = [
		edge("a-b", "a", "b"),
		edge("b-c", "b", "c"),
		edge("c-a", "c", "a"),
		edge("b-d", "b", "d"),
		edge("d-b", "d", "b"),
	];

	expect(validateFlowGraph({ nodes, edges }, "save")).toEqual([
		{
			code: "cycle",
			edgeId: "c-a",
			message: "The connection makes a loop. Use a loop group to repeat steps.",
		},
		{
			code: "cycle",
			edgeId: "d-b",
			message: "The connection makes a loop. Use a loop group to repeat steps.",
		},
	]);
});
