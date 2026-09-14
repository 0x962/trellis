import { FlowEdgeSchema, FlowNodeSchema } from "@trellis/api";
import { z } from "zod";
import type { DraftBundle, DraftEntry } from "./types";

const graph = z.object({
	version: z.number().int().positive(),
	graph: z.object({ nodes: z.array(FlowNodeSchema).max(500), edges: z.array(FlowEdgeSchema).max(2000) }),
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
	entries: z
		.array(
			z.strictObject({
				area: z.enum(["local", "session"]),
				key: z.string().min(1).max(8192),
				value: z.string().max(8 * 1024 * 1024),
			}),
		)
		.max(1000),
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
	if (new TextEncoder().encode(text).length > 10 * 1024 * 1024) throw new Error("The draft file exceeds 10 MiB.");
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
