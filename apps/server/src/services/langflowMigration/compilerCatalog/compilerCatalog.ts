import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import templateSchema from "../../../../../../../integrations/langflow/components/catalog/exportTemplates/frontend-templates.schema.v1.json";
import type { ConversionCompilerInput } from "../conversionCompilerTypes";
import { sourceDigest } from "../sourceDigest";

const definition = z.looseObject({
	id: z.string(), version: z.number(), className: z.string(),
	source: z.object({ root: z.string(), path: z.string(), sha256: z.string() }),
	qualification: z.string(), allowedForPublication: z.boolean(),
});
const catalogSchema = z.looseObject({
	schemaVersion: z.literal(1), catalogId: z.string(),
	engine: z.object({ name: z.literal("langflow"), version: z.string(), commit: z.string() }),
	allowedForPublication: z.boolean(), supportedMappings: z.array(z.json()),
	legacyMappings: z.array(z.json()), blockers: z.record(z.string(), z.string()),
	definitions: z.array(definition),
});
const templatesSchema = z.fromJSONSchema(templateSchema as Parameters<typeof z.fromJSONSchema>[0]).pipe(
	z.looseObject({
		...catalogSchema.shape, componentManifestHash: z.string(), engineOverlayHash: z.string(),
		definitions: z.array(definition.extend({ frontendTemplate: z.looseObject({
			id: z.string(), data: z.looseObject({ id: z.string(), type: z.string(), node: z.record(z.string(), z.json()) }),
		}) })),
	}),
);
const parse = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));

export const compilerCatalog = (input: ConversionCompilerInput) => {
	const catalog = catalogSchema.parse(parse(input.catalogBytes));
	if (sourceDigest(input.catalogBytes) !== input.componentManifestHash || catalog.engine.commit !== input.engineCommit)
		throw new Error("conversion_catalog_identity_conflict");
	const templates = input.frontendTemplateBytes === null ? null : templatesSchema.parse(parse(input.frontendTemplateBytes));
	if (templates !== null) {
		if (templates.componentManifestHash !== input.componentManifestHash || templates.engineOverlayHash !== input.engineOverlayHash)
			throw new Error("conversion_template_package_conflict");
		for (const key of ["catalogId", "engine", "allowedForPublication", "supportedMappings", "legacyMappings", "blockers"] as const)
			if (!isDeepStrictEqual(templates[key], catalog[key])) throw new Error(`conversion_template_catalog_conflict:${key}`);
		const originals = new Map(catalog.definitions.map((entry) => [entry.id, entry]));
		const ids = new Set<string>();
		const classes = new Set<string>();
		if (originals.size !== catalog.definitions.length || templates.definitions.length !== originals.size)
			throw new Error("conversion_template_definition_count");
		for (const entry of templates.definitions) {
			const original = originals.get(entry.id);
			if (!original || ids.has(entry.id) || classes.has(entry.className) ||
				entry.frontendTemplate.id !== entry.frontendTemplate.data.id || entry.frontendTemplate.data.type !== entry.className)
				throw new Error("conversion_template_definition_conflict");
			ids.add(entry.id);
			classes.add(entry.className);
			for (const key of ["version", "className", "source", "qualification", "allowedForPublication"] as const)
				if (!isDeepStrictEqual(entry[key], original[key])) throw new Error(`conversion_template_source_conflict:${key}`);
			const fields = z.record(z.string(), z.json()).parse(entry.frontendTemplate.data.node.template);
			const code = z.object({ value: z.string() }).parse(fields.code);
			if (sourceDigest(code.value) !== original.source.sha256) throw new Error("conversion_template_code_conflict");
		}
	}
	return { catalog, templates };
};
