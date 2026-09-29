import { z } from "zod";
import envelopeSchema from "../../../../../../../integrations/langflow/components/catalog/exportTemplates/frontend-templates.schema.v1.json";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const source = z.strictObject({ root: z.enum(["trellis", "engine"]), path: z.string().min(1), sha256: digest });
const engine = z.strictObject({ name: z.literal("langflow"), version: z.string(), commit: z.string() });
const qualification = {
	id: z.string().min(1),
	version: z.number().int().positive(),
	className: z.string().min(1),
	source,
	qualification: z.string(),
	allowedForPublication: z.boolean(),
};
const fields = {
	schemaVersion: z.literal(1),
	catalogId: z.string(),
	engine,
	allowedForPublication: z.boolean(),
	supportedMappings: z.array(z.json()),
	legacyMappings: z.array(z.json()),
	blockers: z.record(z.string(), z.string()),
};
export const catalogSchema = z.looseObject({
	...fields,
	definitions: z.array(z.looseObject({ ...qualification, sourceDependencies: z.array(source) })),
	runtimeSources: z.array(source),
	edgeHandles: z.looseObject({ engineSource: source, frontendSource: source }),
});

export const nativeNodeSchema = z.looseObject({
	template: z.record(z.string(), z.json()),
	outputs: z.array(z.record(z.string(), z.json())),
});
export const templatesSchema = z.fromJSONSchema(envelopeSchema as Parameters<typeof z.fromJSONSchema>[0]).pipe(
	z.looseObject({
		...fields,
		kind: z.literal("trellis-frontend-templates"),
		componentManifestHash: digest,
		engineOverlayHash: digest,
		definitions: z.array(
			z.looseObject({
				...qualification,
				frontendTemplate: z.looseObject({
					id: z.string(),
					data: z.looseObject({ id: z.string(), type: z.string(), node: nativeNodeSchema }),
				}),
			}),
		),
	}),
);
export type Catalog = z.infer<typeof catalogSchema>;
export type Templates = z.infer<typeof templatesSchema>;
