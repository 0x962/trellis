import {
	createDenseGraphFixture,
	denseGraphCases,
} from "../../../../reports/langflow-large-graph-design/denseGraph/denseGraph.ts";
import { langflowGraphFixture } from "./langflowGraphFixture.ts";

export function probeGraph(name: string | undefined) {
	if (name === undefined) return langflowGraphFixture;
	const dimensions = denseGraphCases.find((candidate) => candidate.name === name);
	if (dimensions === undefined) throw new Error(`Unknown editor fixture: ${name}`);
	const graph = createDenseGraphFixture(dimensions).graph;
	const rows = [...new Set(graph.nodes.map((node) => node.position.y))].sort((a, b) => a - b);
	return {
		...graph,
		nodes: graph.nodes.map((node) => ({
			...node,
			position: { ...node.position, y: rows.indexOf(node.position.y) * 800 },
		})),
	};
}
