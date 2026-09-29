import type { EditorCatalog } from "../editorCatalog";

export function editorPalette(catalog: EditorCatalog) {
	const exported = catalog.frontendTemplates;
	if (exported === null) throw new Error("The installed package has no verified frontend templates.");
	const definitions = exported.definitions.filter(
		(item) => catalog.allowedForPublication && item.allowedForPublication,
	);
	if (definitions.length === 0) throw new Error("The installed catalog has no approved editor components.");
	return {
		trellis: Object.fromEntries(
			definitions.map(({ frontendTemplate }) => [frontendTemplate.data.type, frontendTemplate.data.node]),
		),
		component_display_names: {},
	};
}
