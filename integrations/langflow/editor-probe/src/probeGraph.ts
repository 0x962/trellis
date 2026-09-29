import {
	createDenseGraphFixture,
	denseGraphCases,
} from "../../../../reports/langflow-large-graph-design/denseGraph/denseGraph.ts";
import { langflowGraphFixture } from "./langflowGraphFixture.ts";

export function probeGraph(name: string | undefined) {
	if (name === undefined) return langflowGraphFixture;
	const dimensions = denseGraphCases.find((candidate) => candidate.name === name);
	if (dimensions === undefined) throw new Error(`Unknown editor fixture: ${name}`);
	return createDenseGraphFixture(dimensions).graph;
}
