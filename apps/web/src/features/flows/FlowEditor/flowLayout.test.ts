import { expect, test } from "bun:test";
import { addNode, toCanvas } from "./flowDraft";
import { tidyLayout } from "./flowLayout";

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
