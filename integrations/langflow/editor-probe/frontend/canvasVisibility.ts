import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const frontend = process.argv[2]!;
const patch = await readFile(new URL("../patches/trellis-editor-probe.patch", import.meta.url), "utf8");
const section = patch.split("diff --git a/src/customization/trellis-editor-canvas.ts ")[1]!.split("diff --git ")[0]!;
const source = section
	.split("\n")
	.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
	.map((line) => line.slice(1))
	.join("\n");
const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
const { trellisCanvasNodes } = await import(
	`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);
const { adoptUserNodes, getNodesInside } = await import(
	pathToFileURL(join(frontend, "node_modules/@xyflow/system/dist/esm/index.js")).href
);

for (const count of [500, 501]) {
	const nodes = Array.from({ length: count }, (_, index) => ({
		id: String(index),
		position: { x: (index % 20) * 360, y: Math.floor(index / 20) * 800 },
		data: {},
	}));
	const baseline = new Map();
	adoptUserNodes(nodes, baseline, new Map());
	const projected = new Map();
	adoptUserNodes(trellisCanvasNodes(nodes), projected, new Map());
	const rect = { x: 0, y: 0, width: 1440, height: 900 };
	const before = getNodesInside(baseline, rect, [0, 0, 0.75], true);
	const after = getNodesInside(projected, rect, [0, 0, 0.75], true);
	assert.equal(before.length, count);
	assert.ok(after.length < count);
	assert.equal(projected.size, count);
	const last = nodes.at(-1)!;
	const panned = getNodesInside(
		projected,
		{ ...rect, width: 320, height: 800 },
		[-last.position.x * 0.75, -last.position.y * 0.75, 0.75],
		true,
	);
	assert.ok(panned.some((node: { id: string }) => node.id === last.id));
	console.log(
		JSON.stringify({ count, before: before.length, after: after.length, retained: projected.size, last: last.id }),
	);
}
