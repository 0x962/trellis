import { describe, expect, test } from "bun:test";
import type { FlowNode } from "@trellis/api";
import { ulid } from "ulid";
import { absolutePosition, boxAt } from "./canvasGeometry";
import {
	addNode,
	boxEnds,
	branchOf,
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
	parallel: false,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
	...fields,
});

const box = row({
	kind: "group",
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
const center = { center: { x: 500, y: 500 } };

describe("flowDraft", () => {
	test("toCanvas puts a box before the node inside it, and fromCanvas gives back the saved rows", () => {
		const canvas = toCanvas({ nodes: [inside, box, outside], edges: [] });
		expect(canvas.nodes.map((node) => node.id)).toEqual([box.id, outside.id, inside.id]);
		expect(canvas.nodes[0]).toMatchObject({ type: "box", width: 400, height: 300 });
		expect(fromCanvas(canvas.nodes, canvas.edges).nodes).toEqual(expect.arrayContaining([inside, box, outside]));
	});

	test("a box without a stored size takes the default size", () => {
		const bare = row({ kind: "loop", maxRounds: 2, instruction: "Done?" });
		expect(fromCanvas(toCanvas({ nodes: [bare], edges: [] }).nodes, []).nodes[0]).toMatchObject({
			width: 360,
			height: 220,
		});
	});

	test("branchOf reads the output from a handle id", () => {
		expect(branchOf("yes-bottom")).toBe("yes");
		expect(branchOf("no-right")).toBe("no");
		expect(branchOf("out-top")).toBe("out");
		expect(branchOf("in-left")).toBe("out");
		expect(branchOf(null)).toBe("out");
	});

	test("canConnect refuses a loop, an edge across a box, and a gate handle that is not YES or NO", () => {
		const a = row({});
		const b = row({});
		const gate = row({ kind: "gate", instruction: "Backend?" });
		const nodes = fromCanvas(toCanvas({ nodes: [a, b, gate, box, inside], edges: [] }).nodes, []).nodes;
		const graph = { nodes, edges: [{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" as const }] };
		expect(canConnect(graph, { source: b.id, target: a.id, sourceHandle: "out-top" })).toBe(false);
		expect(canConnect(graph, { source: a.id, target: inside.id, sourceHandle: "out-right" })).toBe(false);
		expect(canConnect(graph, { source: gate.id, target: a.id, sourceHandle: "in-top" })).toBe(false);
		expect(canConnect(graph, { source: gate.id, target: a.id, sourceHandle: "yes-bottom" })).toBe(true);
		expect(canConnect(graph, { source: a.id, target: box.id, sourceHandle: "out-left" })).toBe(true);
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

	test("a drop inside an empty box stores the position relative to the box and adds no edge", () => {
		const next = addNode(toCanvas({ nodes: [box], edges: [] }).nodes, [], "agent", { drop: { x: 150, y: 180 } });
		expect(next.nodes.find((node) => node.id === next.id)).toMatchObject({
			parentId: box.id,
			position: { x: 50, y: 80 },
			selected: true,
		});
		expect(absolutePosition(next.nodes, next.id)).toEqual({ x: 150, y: 180 });
		expect(next.edges).toEqual([]);
	});

	test("a click adds the node below the newest node and connects the two", () => {
		const first = row({ x: 40, y: 16 });
		const next = addNode(toCanvas({ nodes: [first], edges: [] }).nodes, [], "agent", center);
		expect(next.nodes.find((node) => node.id === next.id)?.position).toEqual({ x: 40, y: 144 });
		expect(next.edges).toMatchObject([{ source: first.id, target: next.id, data: { branch: "out" } }]);
	});

	test("a click with a gate selected connects the new node from the gate by YES", () => {
		const gate = row({ kind: "gate", instruction: "Backend?" });
		const later = row({ x: 400 });
		const nodes = toCanvas({ nodes: [gate, later], edges: [] }).nodes.map((node) =>
			node.id === gate.id ? { ...node, selected: true } : node,
		);
		const next = addNode(nodes, [], "agent", center);
		expect(next.edges).toMatchObject([{ source: gate.id, target: next.id, data: { branch: "yes" } }]);
	});

	test("a click with a box selected adds the node inside the box after its newest node, and the box grows", () => {
		const small = row({ kind: "group", instruction: "", minutes: 5, width: 280, height: 160 });
		const child = row({ parentId: small.id, x: 24, y: 48 });
		const nodes = toCanvas({ nodes: [small, child], edges: [] }).nodes.map((node) =>
			node.id === small.id ? { ...node, selected: true } : node,
		);
		const next = addNode(nodes, [], "agent", center);
		expect(next.nodes.find((node) => node.id === next.id)).toMatchObject({
			parentId: small.id,
			position: { x: 24, y: 176 },
		});
		expect(next.edges).toMatchObject([{ source: child.id, target: next.id }]);
		expect(next.nodes.find((node) => node.id === small.id)).toMatchObject({ height: 256, selected: false });
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
		const issues = draftIssues(ulid(), fromCanvas(toCanvas({ nodes: [blank, lonely], edges: [] }).nodes, []));
		expect(issues.byRow.get(blank.id)).toBe("Write a title.");
		expect(issues.byRow.get(lonely.id)).toBe("Select a persona or write an instruction.");
		expect(issues.count).toBe(2);
	});
});

describe("boxes", () => {
	test("a new box comes with one agent step inside it, and the edge from the step before reaches the box", () => {
		const first = row({});
		const next = addNode(toCanvas({ nodes: [first], edges: [] }).nodes, [], "group", center);
		const inside = next.nodes.filter((node) => node.parentId === next.id);
		expect(inside).toHaveLength(1);
		expect(inside[0]).toMatchObject({ type: "step", data: { fields: { kind: "agent" } } });
		expect(next.edges).toMatchObject([{ source: first.id, target: next.id }]);
	});

	test("boxEnds finds the one step a box starts at and the one step it ends at", () => {
		const a = row({ parentId: box.id });
		const b = row({ parentId: box.id });
		const edges = [{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" as const }];
		const graph = fromCanvas(toCanvas({ nodes: [box, a, b], edges }).nodes, toCanvas({ nodes: [], edges }).edges);
		expect(boxEnds(graph)).toEqual({ entryOf: new Map([[box.id, a.id]]), exitOf: new Map([[box.id, b.id]]) });
		const loose = fromCanvas(toCanvas({ nodes: [box, a, b], edges: [] }).nodes, []);
		expect(boxEnds(loose)).toEqual({ entryOf: new Map(), exitOf: new Map() });
	});
});

test("parallel groups connect at the boundary and add children without edges", () => {
	const group = row({ kind: "group", parallel: true, instruction: "", width: 400, height: 300 });
	const child = row({ parentId: group.id });
	const canvas = toCanvas({ nodes: [group, child], edges: [] });
	const selected = canvas.nodes.map((node) => ({ ...node, selected: node.id === group.id }));
	const next = addNode(selected, [], "agent", center);
	expect(next.edges).toEqual([]);
	expect(boxEnds(fromCanvas(next.nodes, next.edges))).toEqual({ entryOf: new Map(), exitOf: new Map() });
	expect(canConnect(fromCanvas(next.nodes, next.edges), { source: child.id, target: next.id })).toBe(false);
});
