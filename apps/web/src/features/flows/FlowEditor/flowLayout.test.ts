import { expect, test } from "bun:test";
import { addNode, canvasEdge, newFields, toCanvas } from "./flowDraft";
import { tidyLayout } from "./flowLayout";

const node = (id: string, parentId: string | null = null, kind: "agent" | "group" = "agent") => ({
	...newFields(kind),
	id,
	parentId,
	x: 0,
	y: 0,
	width: kind === "group" ? 360 : null,
	height: kind === "group" ? 220 : null,
});

test("connected nodes occupy top-to-bottom ranks and branches share a row", () => {
	const canvas = toCanvas({ nodes: [node("start"), node("left"), node("right"), node("finish")], edges: [] });
	const edges = [
		canvasEdge({ id: "one", fromNodeId: "start", toNodeId: "left", branch: "out" }),
		canvasEdge({ id: "two", fromNodeId: "start", toNodeId: "right", branch: "out" }),
		canvasEdge({ id: "three", fromNodeId: "left", toNodeId: "finish", branch: "out" }),
		canvasEdge({ id: "four", fromNodeId: "right", toNodeId: "finish", branch: "out" }),
	];
	const placed = new Map(tidyLayout(canvas.nodes, edges).map((item) => [item.id, item]));
	expect(placed.get("start")!.position.y).toBeLessThan(placed.get("left")!.position.y);
	expect(placed.get("left")!.position.y).toBe(placed.get("right")!.position.y);
	expect(placed.get("left")!.position.x).not.toBe(placed.get("right")!.position.x);
	expect(placed.get("finish")!.position.y).toBeGreaterThan(placed.get("left")!.position.y);
});

test("nested sequential nodes stay inside the resized group", () => {
	const canvas = toCanvas({
		nodes: [node("group", null, "group"), node("first", "group"), node("second", "group")],
		edges: [],
	});
	const edges = [canvasEdge({ id: "edge", fromNodeId: "first", toNodeId: "second", branch: "out" })];
	const placed = tidyLayout(canvas.nodes, edges);
	const group = placed.find((item) => item.id === "group")!;
	for (const child of placed.filter((item) => item.parentId === "group")) {
		expect(child.position.x).toBeGreaterThanOrEqual(24);
		expect(child.position.y).toBeGreaterThanOrEqual(48);
		expect(child.position.x + 224).toBeLessThanOrEqual(group.width!);
		expect(child.position.y + 56).toBeLessThanOrEqual(group.height!);
	}
});

test("parallel groups wrap their children into rows and keep every child inside the group", () => {
	let canvas = toCanvas({ nodes: [], edges: [] });
	const first = addNode(canvas.nodes, canvas.edges, "group", { center: { x: 0, y: 0 } });
	const groupId = first.id;
	canvas = {
		nodes: first.nodes.map((node) =>
			node.id === groupId ? { ...node, data: { fields: { ...node.data.fields, parallel: true } } } : node,
		),
		edges: first.edges,
	};
	for (let i = 0; i < 6; i++) {
		canvas.nodes = canvas.nodes.map((node) => ({ ...node, selected: node.id === groupId }));
		canvas = addNode(canvas.nodes, canvas.edges, "agent", { center: { x: 0, y: 0 } });
	}
	const placed = tidyLayout(canvas.nodes, canvas.edges);
	const group = placed.find((node) => node.id === groupId)!;
	const children = placed.filter((node) => node.parentId === groupId);
	expect(new Set(children.map((node) => node.position.y)).size).toBeGreaterThan(1);
	expect(new Set(children.map((node) => node.position.x)).size).toBeLessThanOrEqual(2);
	for (const child of children) {
		expect(child.position.x + 224).toBeLessThanOrEqual(group.width!);
		expect(child.position.y + 56).toBeLessThanOrEqual(group.height!);
	}
});
