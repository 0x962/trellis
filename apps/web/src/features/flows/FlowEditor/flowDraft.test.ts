import { describe, expect, test } from "bun:test";
import type { FlowNode } from "@trellis/api";
import { ulid } from "ulid";
import {
	absolutePosition,
	addNode,
	boxAt,
	canConnect,
	canvasEdge,
	draftIssues,
	fromCanvas,
	moveIntoBox,
	toCanvas,
} from "./flowDraft";

const row = (fields: Partial<FlowNode>): FlowNode => ({
	id: ulid(),
	parentId: null,
	kind: "agent",
	title: "Step",
	personaId: null,
	instruction: "Read the diff.",
	model: null,
	effort: null,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	...fields,
});

const box = row({
	kind: "budget",
	title: "Checks",
	instruction: "",
	minutes: 10,
	x: 100,
	y: 100,
	width: 400,
	height: 300,
});
const inside = row({ parentId: box.id, x: 20, y: 40 });
const outside = row({ x: 700, y: 0 });

describe("flowDraft", () => {
	test("toCanvas puts a box before the node inside it, and fromCanvas gives back the saved rows", () => {
		const doc = { nodes: [inside, box, outside], edges: [] };
		const canvas = toCanvas(doc);
		expect(canvas.nodes.map((node) => node.id)).toEqual([box.id, outside.id, inside.id]);
		expect(canvas.nodes[0]).toMatchObject({ type: "box", width: 400, height: 300 });
		const graph = fromCanvas(canvas.nodes, canvas.edges);
		expect(graph.nodes).toEqual(expect.arrayContaining([inside, box, outside]));
	});

	test("a box without a stored size takes the default size", () => {
		const bare = row({ kind: "loop", maxRounds: 2, instruction: "Done?" });
		expect(fromCanvas(toCanvas({ nodes: [bare], edges: [] }).nodes, []).nodes[0]).toMatchObject({
			width: 360,
			height: 220,
		});
	});

	test("canConnect refuses a loop, an edge across a box, and `out` from a gate", () => {
		const a = row({});
		const b = row({});
		const gate = row({ kind: "gate", instruction: "Backend?" });
		const nodes = fromCanvas(toCanvas({ nodes: [a, b, gate, box, inside], edges: [] }).nodes, []).nodes;
		const edges = [{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" as const }];
		const graph = { nodes, edges };
		expect(canConnect(graph, { source: b.id, target: a.id, sourceHandle: "out" })).toBe(false);
		expect(canConnect(graph, { source: a.id, target: inside.id, sourceHandle: "out" })).toBe(false);
		expect(canConnect(graph, { source: gate.id, target: a.id, sourceHandle: "out" })).toBe(false);
		expect(canConnect(graph, { source: gate.id, target: a.id, sourceHandle: "yes" })).toBe(true);
		expect(canConnect(graph, { source: a.id, target: box.id, sourceHandle: "out" })).toBe(true);
	});

	test("boxAt finds the innermost box under a point and skips the box that moves", () => {
		const inner = row({
			kind: "loop",
			maxRounds: 2,
			instruction: "Done?",
			parentId: box.id,
			x: 50,
			y: 50,
			width: 200,
			height: 150,
		});
		const nodes = toCanvas({ nodes: [box, inner], edges: [] }).nodes;
		expect(boxAt(nodes, { x: 200, y: 200 }, null)).toBe(inner.id);
		expect(boxAt(nodes, { x: 110, y: 110 }, null)).toBe(box.id);
		expect(boxAt(nodes, { x: 200, y: 200 }, box.id)).toBe(null);
		expect(boxAt(nodes, { x: 900, y: 900 }, null)).toBe(null);
	});

	test("addNode inside a box stores the position relative to the box", () => {
		const start = toCanvas({ nodes: [box], edges: [] }).nodes;
		const { nodes, id } = addNode(start, "agent", { x: 150, y: 180 });
		const added = nodes.find((node) => node.id === id)!;
		expect(added).toMatchObject({ parentId: box.id, position: { x: 50, y: 80 }, selected: true });
		expect(absolutePosition(nodes, id)).toEqual({ x: 150, y: 180 });
	});

	test("moveIntoBox keeps the place on screen and removes the edges that cross the box", () => {
		const canvas = toCanvas({ nodes: [box, inside, outside], edges: [] });
		const edge = canvasEdge({ id: ulid(), fromNodeId: outside.id, toNodeId: box.id, branch: "out" });
		const moved = moveIntoBox(canvas.nodes, [edge], outside.id, box.id);
		expect(moved.removed).toBe(1);
		expect(moved.edges).toEqual([]);
		expect(absolutePosition(moved.nodes, outside.id)).toEqual({ x: 700, y: 0 });
		const back = moveIntoBox(moved.nodes, [], inside.id, null);
		expect(back.nodes.find((node) => node.id === inside.id)).toMatchObject({ position: { x: 120, y: 140 } });
		expect(back.nodes.find((node) => node.id === inside.id)?.parentId).toBeUndefined();
	});

	test("draftIssues names the row of a schema issue and of a graph issue", () => {
		const blank = row({ title: "   " });
		const lonely = row({ instruction: "" });
		const graph = fromCanvas(toCanvas({ nodes: [blank, lonely], edges: [] }).nodes, []);
		const issues = draftIssues(ulid(), graph);
		expect(issues.byRow.get(blank.id)).toBe("Write a title.");
		expect(issues.byRow.get(lonely.id)).toBe("Select a persona or write an instruction.");
		expect(issues.count).toBe(2);
	});
});
