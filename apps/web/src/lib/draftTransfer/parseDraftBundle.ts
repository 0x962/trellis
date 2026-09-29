import { FlowEdgeSchema, FlowNodeSchema } from "@trellis/api";
import { z } from "zod";
import type { DraftBundle, DraftEntry } from "./types";

const graph = z.object({
	version: z.number().int().positive(),
	graph: z.object({ nodes: z.array(FlowNodeSchema), edges: z.array(FlowEdgeSchema) }),
});
const finding = z.object({
	id: z.string(),
	path: z.string(),
	side: z.enum(["old", "new"]),
	line: z.number().int(),
	startLine: z.number().int(),
	body: z.string(),
	revisionId: z.string().nullable(),
});
const schema = z.strictObject({
	format: z.literal("trellis-drafts"),
	version: z.literal(1),
	exportedAt: z.iso.datetime(),
	entries: z.array(
		z.strictObject({
			area: z.enum(["local", "session"]),
			key: z.string().min(1),
			value: z.string(),
		}),
	),
});
export function draftKind(entry: Pick<DraftEntry, "area" | "key">): "flow" | "review" | "text" | "ticket" | null {
	if (entry.area === "session") return entry.key === "trellis-composer-draft" ? "ticket" : null;
	if (/^trellis\.flow-draft\.[^.]+\.[^.]+$/.test(entry.key)) return "flow";
	if (entry.key.startsWith("trellis.review.summary:")) return "text";
	if (entry.key.startsWith("trellis.review.drafts:"))
		return entry.key.includes(":compose:") || entry.key.includes(":edit:") ? "text" : "review";
	return null;
}
export function parseDraftBundle(text: string): DraftBundle {
	const bundle = schema.parse(JSON.parse(text));
	for (const entry of bundle.entries) {
		const kind = draftKind(entry);
		if (kind === null) throw new Error(`This key is not a draft: ${entry.key}`);
		if (kind === "flow") graph.parse(JSON.parse(entry.value));
		if (kind === "review") z.array(finding).parse(JSON.parse(entry.value));
		if (kind === "ticket")
			z.strictObject({ title: z.string(), description: z.string() }).parse(JSON.parse(entry.value));
	}
	return bundle;
}
