import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const engine = z
	.object({ name: z.literal("langflow"), version: z.string().min(1), commit: z.string().regex(/^[a-f0-9]{40}$/) })
	.passthrough();
const source = z.object({ root: z.enum(["trellis", "engine"]), path: z.string().min(1), sha256: digest }).passthrough();
const definition = z
	.object({
		id: z.string(),
		version: z.number().int().positive(),
		className: z.string(),
		source,
		qualification: z.string(),
		allowedForPublication: z.boolean(),
	})
	.passthrough();
const policy = {
	allowedForPublication: z.boolean(),
	supportedMappings: z.array(z.json()),
	legacyMappings: z.array(z.record(z.string(), z.json())),
	blockers: z.record(z.string(), z.string()),
};
const template = z
	.object({
		id: z.string(),
		data: z.object({ id: z.string(), type: z.string(), node: z.record(z.string(), z.json()) }).passthrough(),
	})
	.passthrough();
const exported = z
	.object({
		schemaVersion: z.literal(1),
		kind: z.literal("trellis-frontend-templates"),
		catalogId: z.string().min(1),
		componentManifestHash: digest,
		engine,
		engineOverlayHash: digest,
		...policy,
		definitions: z.array(definition.extend({ frontendTemplate: template })),
	})
	.passthrough();

export const EditorCatalogSchema = z
	.object({
		schemaVersion: z.literal(1),
		catalogId: z.string().min(1),
		engine,
		...policy,
		definitions: z.array(definition.extend({ frontendTemplate: z.null() })),
		frontendTemplates: exported.nullable(),
	})
	.passthrough();
