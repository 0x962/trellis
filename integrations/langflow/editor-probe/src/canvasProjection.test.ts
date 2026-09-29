import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const patch = await readFile(new URL("../patches/trellis-editor-probe.patch", import.meta.url), "utf8");
const section = patch.split("diff --git a/src/customization/trellis-editor-canvas.ts ")[1]!.split("diff --git ")[0]!;
const source = section
	.split("\n")
	.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
	.map((line) => line.slice(1))
	.join("\n");
const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
const { trellisCanvasNodes, trellisCanvasEdges } = await import(
	`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

function graph(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `node-${index}`,
		position: { x: (index % 20) * 360, y: Math.floor(index / 20) * 340 },
		data: { instruction: "Preserve the full instruction. ".repeat(4096) },
	}));
}

test("the projection preserves every node and its field bytes", () => {
	for (const count of [7, 500, 501, 1001]) {
		const nodes = graph(count);
		const before = JSON.stringify(nodes);
		const projected = trellisCanvasNodes(nodes);
		expect(projected).toHaveLength(count);
		for (let index = 0; index < count; index++) {
			expect(projected[index].data).toBe(nodes[index]!.data);
			expect(projected[index].position).toBe(nodes[index]!.position);
			expect(projected[index].handles).toEqual([]);
			expect(projected[index].initialWidth).toBe(320);
		}
		expect(JSON.stringify(nodes)).toBe(before);
	}
});

test("measured nodes retain their dimensions and port metadata", () => {
	const node = {
		...graph(1)[0],
		initialWidth: 412,
		initialHeight: 920,
		measured: { width: 413, height: 930 },
		handles: [{ id: "typed-port", type: "source" }],
	};
	expect(trellisCanvasNodes([node])).toEqual([node]);
});

test("edges wait for port measurements without changes to the save graph", () => {
	const nodes = graph(3);
	const edges = [
		{ id: "edge-1", source: "node-0", target: "node-1" },
		{ id: "edge-2", source: "node-1", target: "node-2" },
	];
	expect(trellisCanvasEdges(nodes, edges)).toEqual([]);
	const measured = nodes.map((node, index) => ({
		...node,
		measured: index < 2 ? { width: 320, height: 700 } : undefined,
	}));
	expect(trellisCanvasEdges(measured, edges)).toEqual([edges[0]]);
	expect(edges).toHaveLength(2);
	expect(nodes.every((node) => !("measured" in node))).toBe(true);
	measured[2]!.measured = { width: 320, height: 700 };
	expect(trellisCanvasEdges(measured, edges)).toEqual(edges);
});

test("the pinned patch uses the saved viewport and the existing zoom control", () => {
	expect(patch).toContain("+              onlyRenderVisibleElements={TRELLIS_EDITOR_PROBE}");
	expect(patch).toContain("+              defaultViewport={TRELLIS_EDITOR_PROBE ? savedViewport : undefined}");
	expect(patch).toContain("+      applyLoadedFlowToCanvas(flow, { fitView: !TRELLIS_EDITOR_PROBE });");
	expect(patch).toContain("+        <CanvasControlsDropdown selectedNode={null} />");
});
