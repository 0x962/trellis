import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { InstalledEditorManifest } from "../../../langflowEditorSessions/types";
import { assertContent } from "./assertContent.ts";
import { catalogSchema, templatesSchema } from "./schemas.ts";

export function createManifest(input: {
	catalogBytes: Buffer;
	templateBytes: Buffer | null;
	componentManifestHash: string;
	engineOverlayHash: string;
}): InstalledEditorManifest {
	const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
	if (digest(input.catalogBytes) !== input.componentManifestHash) throw new Error("editor_catalog_digest_conflict");
	const catalog = catalogSchema.parse(JSON.parse(input.catalogBytes.toString("utf8")));
	const templates =
		input.templateBytes === null ? null : templatesSchema.parse(JSON.parse(input.templateBytes.toString("utf8")));
	if (templates !== null) {
		if (
			templates.componentManifestHash !== input.componentManifestHash ||
			templates.engineOverlayHash !== input.engineOverlayHash
		)
			throw new Error("editor_template_package_conflict");
		for (const key of [
			"catalogId",
			"engine",
			"allowedForPublication",
			"supportedMappings",
			"legacyMappings",
			"blockers",
		] as const)
			if (!isDeepStrictEqual(templates[key], catalog[key])) throw new Error(`editor_template_catalog_conflict: ${key}`);
		const definitions = new Map(catalog.definitions.map((entry) => [entry.id, entry]));
		const seen = new Set<string>();
		const types = new Set<string>();
		if (definitions.size !== catalog.definitions.length || templates.definitions.length !== definitions.size)
			throw new Error("editor_template_definitions_conflict");
		for (const entry of templates.definitions) {
			const original = definitions.get(entry.id);
			if (
				!original ||
				seen.has(entry.id) ||
				types.has(entry.frontendTemplate.data.type) ||
				entry.frontendTemplate.data.type !== entry.className ||
				entry.frontendTemplate.id !== entry.frontendTemplate.data.id
			)
				throw new Error("editor_template_definition_conflict");
			seen.add(entry.id);
			types.add(entry.frontendTemplate.data.type);
			for (const key of ["version", "className", "source", "qualification", "allowedForPublication"] as const)
				if (!isDeepStrictEqual(entry[key], original[key]))
					throw new Error(`editor_template_definition_conflict: ${key}`);
			const code = entry.frontendTemplate.data.node.template.code as { value: string };
			if (digest(code.value) !== original.source.sha256) throw new Error("editor_template_code_conflict");
		}
	}
	return {
		hash: input.componentManifestHash,
		publicManifest: { ...structuredClone(catalog), frontendTemplates: structuredClone(templates) },
		assertContent: async (content) => assertContent(content, input.componentManifestHash, templates),
	};
}
