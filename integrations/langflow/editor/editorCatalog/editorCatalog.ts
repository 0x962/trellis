import type { z } from "zod";
import { EditorCatalogSchema } from "./schema";

export type EditorCatalog = z.infer<typeof EditorCatalogSchema>;

export function readEditorCatalog(value: unknown, componentManifestHash: string): EditorCatalog {
	const catalog = EditorCatalogSchema.parse(value);
	const exported = catalog.frontendTemplates;
	if (exported === null) return catalog;
	if (
		exported.componentManifestHash !== componentManifestHash ||
		exported.catalogId !== catalog.catalogId ||
		exported.engine.name !== catalog.engine.name ||
		exported.engine.version !== catalog.engine.version ||
		exported.engine.commit !== catalog.engine.commit ||
		exported.allowedForPublication !== catalog.allowedForPublication
	)
		throw new Error("The frontend templates do not match the granted catalog.");
	const declarations = new Map(catalog.definitions.map((item) => [item.id, item]));
	const ids = new Set<string>();
	const types = new Set<string>();
	if (declarations.size !== catalog.definitions.length || exported.definitions.length !== declarations.size)
		throw new Error("The frontend templates do not match the source definitions.");
	for (const item of exported.definitions) {
		const declaration = declarations.get(item.id);
		if (
			declaration === undefined ||
			ids.has(item.id) ||
			types.has(item.className) ||
			item.version !== declaration.version ||
			item.className !== declaration.className ||
			item.source.root !== declaration.source.root ||
			item.source.path !== declaration.source.path ||
			item.source.sha256 !== declaration.source.sha256 ||
			item.qualification !== declaration.qualification ||
			item.allowedForPublication !== declaration.allowedForPublication ||
			item.frontendTemplate.data.type !== item.className
		)
			throw new Error("A frontend template does not match its source definition.");
		ids.add(item.id);
		types.add(item.className);
	}
	return catalog;
}
