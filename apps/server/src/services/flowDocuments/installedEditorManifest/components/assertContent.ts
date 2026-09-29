import { isDeepStrictEqual } from "node:util";
import { type EditorContent, EditorContentSchema } from "@trellis/api";
import { z } from "zod";
import { invalidInput } from "../../../../errors.ts";
import { normalizeNode } from "./normalizeNode.ts";
import { nativeNodeSchema, type Templates } from "./schemas.ts";

const graphSchema = z.looseObject({
	nodes: z.array(
		z.looseObject({
			id: z.string().min(1),
			data: z.looseObject({ id: z.string(), type: z.string(), node: nativeNodeSchema }),
			position: z.object({ x: z.number(), y: z.number() }),
			width: z.number().positive().optional(),
			height: z.number().positive().optional(),
		}),
	),
	edges: z.array(z.looseObject({ id: z.string().min(1), source: z.string(), target: z.string() })),
});

export function assertContent(content: EditorContent, manifestHash: string, templates: Templates | null): void {
	const parsed = EditorContentSchema.parse(content);
	if (parsed.componentManifestHash !== manifestHash)
		throw invalidInput("componentManifestHash", "The catalog does not match the installed package.");
	const graph = graphSchema.parse(parsed.graphDocument);
	const definitions = new Map(templates?.definitions.map((entry) => [entry.frontendTemplate.data.type, entry]));
	const ids = new Set<string>();
	for (const node of graph.nodes) {
		if (ids.has(node.id) || node.data.id !== node.id)
			throw invalidInput("graphDocument", "Each node requires one unique ID.");
		ids.add(node.id);
		const installed = definitions.get(node.data.type)?.frontendTemplate.data;
		if (!installed)
			throw invalidInput("graphDocument", "The installed package has no verified template for this component.");
		const normalized = normalizeNode(node.data, installed);
		if (!isDeepStrictEqual(normalized, installed))
			throw invalidInput("graphDocument", "The component differs from its installed template.");
	}
	const edges = new Set<string>();
	for (const edge of graph.edges) {
		if (edges.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target))
			throw invalidInput("graphDocument", "Each edge requires a unique ID and existing nodes.");
		edges.add(edge.id);
	}
}
