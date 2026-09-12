import { describe, expect, test } from "bun:test";
import { entryNodes, type FlowGraph, type FlowGraphNode, validateFlowGraph } from "./flowGraph.ts";

const agent = (id: string, parentId: string | null = null): FlowGraphNode => ({
	id,
	parentId,
	kind: "agent",
	personaId: null,
	instruction: `Do step ${id}.`,
	title: id,
	parallel: false,
});
const node = (id: string, fields: Partial<FlowGraphNode>): FlowGraphNode => ({ ...agent(id), ...fields });
const edge = (id: string, fromNodeId: string, toNodeId: string, branch: "out" | "yes" | "no" = "out") => ({
	id,
	fromNodeId,
	toNodeId,
	branch,
});
const codes = (graph: FlowGraph) => validateFlowGraph(graph).map((issue) => issue.code);

describe("validateFlowGraph", () => {
	test("a graph with a fan-out, a fan-in, a gate, and a group has no issues", () => {
		const graph: FlowGraph = {
			nodes: [
				agent("summarize"),
				node("frontend", { kind: "gate", instruction: "Does the change touch the web app?" }),
				agent("tokens"),
				agent("skip"),
				node("box", { kind: "group", instruction: "" }),
				agent("migrations", "box"),
				agent("rest", "box"),
				agent("report"),
			],
			edges: [
				edge("e1", "summarize", "frontend"),
				edge("e2", "summarize", "box"),
				edge("e3", "frontend", "tokens", "yes"),
				edge("e4", "frontend", "skip", "no"),
				edge("e5", "migrations", "rest"),
				edge("e6", "tokens", "report"),
				edge("e7", "box", "report"),
			],
		};
		expect(validateFlowGraph(graph)).toEqual([]);
	});

	test("an empty graph has no issues", () => {
		expect(validateFlowGraph({ nodes: [], edges: [] })).toEqual([]);
	});

	test("two rows with one id are a duplicate id", () => {
		expect(codes({ nodes: [agent("a"), agent("a")], edges: [] })).toEqual(["duplicate-id"]);
		expect(
			codes({ nodes: [agent("a"), agent("b"), agent("c")], edges: [edge("e", "a", "b"), edge("e", "b", "c")] }),
		).toEqual(["duplicate-id"]);
	});

	test("a parent must exist, must be a group, and must not contain itself", () => {
		const unknown = validateFlowGraph({ nodes: [agent("a", "ghost")], edges: [] });
		expect(unknown).toEqual([expect.objectContaining({ code: "unknown-parent", nodeId: "a" })]);
		const notGroup = validateFlowGraph({ nodes: [agent("a"), agent("b", "a")], edges: [] });
		expect(notGroup).toEqual([expect.objectContaining({ code: "parent-not-group", nodeId: "b" })]);
		const loop = codes({
			nodes: [
				node("x", { kind: "group", minutes: 5, parentId: "y" } as Partial<FlowGraphNode>),
				node("y", { kind: "group", parentId: "x" }),
			],
			edges: [],
		});
		expect(loop).toEqual(["parent-cycle", "parent-cycle"]);
	});

	test("an edge must name two known nodes, and not the same node twice", () => {
		const graph = { nodes: [agent("a"), agent("b")], edges: [edge("e1", "a", "ghost"), edge("e2", "a", "a")] };
		expect(validateFlowGraph(graph)).toEqual([
			expect.objectContaining({ code: "unknown-node", edgeId: "e1" }),
			expect.objectContaining({ code: "self-edge", edgeId: "e2" }),
		]);
	});

	test("one output may not connect to one node twice", () => {
		const graph = { nodes: [agent("a"), agent("b")], edges: [edge("e1", "a", "b"), edge("e2", "a", "b")] };
		expect(validateFlowGraph(graph)).toEqual([expect.objectContaining({ code: "duplicate-edge", edgeId: "e2" })]);
	});

	test("a gate leaves by yes or no, and every other kind leaves by out", () => {
		const graph = {
			nodes: [node("g", { kind: "gate" }), agent("a"), agent("b")],
			edges: [edge("e1", "g", "a", "out"), edge("e2", "a", "b", "yes"), edge("e3", "g", "b", "no")],
		};
		expect(validateFlowGraph(graph)).toEqual([
			expect.objectContaining({ code: "branch-kind", edgeId: "e1" }),
			expect.objectContaining({ code: "branch-kind", edgeId: "e2" }),
		]);
	});

	test("an edge stays inside one group", () => {
		const graph = {
			nodes: [node("box", { kind: "group" }), agent("inside", "box"), agent("outside")],
			edges: [edge("e1", "inside", "outside"), edge("e2", "outside", "inside")],
		};
		expect(codes(graph)).toEqual(["cross-group-edge", "cross-group-edge"]);
	});

	test("an edge that closes a loop is a cycle", () => {
		const graph = {
			nodes: [agent("a"), agent("b"), agent("c")],
			edges: [edge("e1", "a", "b"), edge("e2", "b", "c"), edge("e3", "c", "a")],
		};
		expect(validateFlowGraph(graph)).toEqual([expect.objectContaining({ code: "cycle", edgeId: "e3" })]);
	});

	test("a node that runs an agent needs a persona or an instruction, and a human node needs an instruction", () => {
		const persona = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
		const graph = {
			nodes: [
				node("blank", { instruction: "  \n " }),
				node("persona", { instruction: "", personaId: persona }),
				node("gate", { kind: "gate", instruction: "" }),
				node("person", { kind: "human", instruction: "", personaId: persona }),
				node("box", { kind: "group", parallel: true, instruction: "" }),
			],
			edges: [],
		};
		expect(validateFlowGraph(graph)).toEqual([
			expect.objectContaining({ code: "empty-prompt", nodeId: "blank" }),
			expect.objectContaining({ code: "empty-prompt", nodeId: "gate" }),
			expect.objectContaining({ code: "empty-prompt", nodeId: "person" }),
		]);
	});

	test("a box that holds steps starts at exactly one of them", () => {
		const box = node("box", { kind: "group", instruction: "" });
		const loose = { nodes: [box, agent("a", "box"), agent("b", "box")], edges: [] };
		expect(validateFlowGraph(loose)).toEqual([expect.objectContaining({ code: "box-entry", nodeId: "box" })]);
		expect(validateFlowGraph({ ...loose, edges: [edge("e1", "a", "b")] })).toEqual([]);
		expect(codes({ nodes: [box], edges: [] })).toEqual(["box-entry"]);
	});

	test("every issue carries a message for a person", () => {
		const issues = validateFlowGraph({ nodes: [agent("a", "ghost")], edges: [edge("e", "a", "a")] });
		for (const issue of issues) expect(issue.message.length).toBeGreaterThan(0);
	});
});

describe("entryNodes", () => {
	test("the entry nodes of a scope are its nodes with no incoming edge, in input order", () => {
		const graph = {
			nodes: [agent("b"), agent("a"), node("box", { kind: "loop" }), agent("x", "box"), agent("y", "box"), agent("c")],
			edges: [edge("e1", "a", "c"), edge("e2", "x", "y"), edge("e3", "b", "box")],
		};
		expect(entryNodes(graph, null)).toEqual(["b", "a"]);
		expect(entryNodes(graph, "box")).toEqual(["x"]);
	});
});

describe("group connections", () => {
	test("parallel children need no edges and cannot connect to each other", () => {
		const group = node("group", { kind: "group", parallel: true, instruction: "" });
		const nodes = [group, agent("a", "group"), agent("b", "group")];
		expect(validateFlowGraph({ nodes, edges: [] })).toEqual([]);
		expect(codes({ nodes, edges: [edge("e", "a", "b")] })).toContain("parallel-edge");
	});

	test("connected groups need one entry, while drafts can keep disconnected steps", () => {
		const group = node("group", { kind: "group", parallel: false, instruction: "" });
		const nodes = [group, agent("a", "group"), agent("b", "group")];
		expect(codes({ nodes, edges: [] })).toContain("box-entry");
		expect(validateFlowGraph({ nodes, edges: [] }, "save")).toEqual([]);
		expect(validateFlowGraph({ nodes, edges: [edge("e", "a", "b")] })).toEqual([]);
	});
});
