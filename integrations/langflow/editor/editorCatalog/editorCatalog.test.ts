import { expect, test } from "bun:test";
import { editorPalette } from "../editorPalette";
import { readEditorCatalog } from "./editorCatalog";

const digest = "a".repeat(64);
function fixture(allowed = true) {
	const definition = {
		id: "fixture",
		version: 1,
		className: "FixtureComponent",
		source: { root: "trellis", path: "fixture.py", sha256: "b".repeat(64) },
		qualification: "fixture",
		allowedForPublication: allowed,
		frontendTemplate: null,
		inputPorts: [{ name: "instructions", fieldType: "str" }],
	};
	const source = {
		schemaVersion: 1,
		catalogId: "trellis-components-v1",
		engine: { name: "langflow", version: "1.12.3", commit: "f".repeat(40) },
		allowedForPublication: allowed,
		supportedMappings: [] as string[],
		legacyMappings: [{ id: "agent", status: "blocked", blockerCodes: ["FIXTURE_ONLY"] }],
		blockers: { FIXTURE_ONLY: "The fixture is not an installed engine export." },
		definitions: [definition],
	};
	const frontendTemplates = {
		...structuredClone(source),
		kind: "trellis-frontend-templates",
		componentManifestHash: digest,
		engineOverlayHash: "c".repeat(64),
		definitions: [
			{
				...structuredClone(definition),
				frontendTemplate: {
					id: "catalog-fixture",
					data: {
						id: "catalog-fixture",
						type: definition.className,
						node: {
							template: { instructions: { value: "x".repeat(50_000) }, code: { value: "fixture source" } },
							field_order: ["instructions"],
							outputs: [{ name: "result", types: ["Data"] }],
						},
					},
				},
			},
		],
	};
	return { ...source, frontendTemplates };
}

test("projects the complete native node under its actual type without changing the source manifest", () => {
	const response = fixture();
	const original = structuredClone(response);
	const catalog = readEditorCatalog(response, digest);
	const palette = editorPalette(catalog);
	expect(palette.trellis.FixtureComponent).toEqual(
		response.frontendTemplates.definitions[0]!.frontendTemplate.data.node,
	);
	expect(palette.component_display_names).toEqual({});
	expect(catalog.definitions[0]!.frontendTemplate).toBeNull();
	expect(catalog.definitions[0]!.inputPorts).toEqual(response.definitions[0]!.inputPorts);
	expect(catalog.blockers).toEqual(response.blockers);
	expect(catalog.frontendTemplates?.legacyMappings).toEqual(response.legacyMappings);
	expect(response).toEqual(original);
});

test("an absent export stays unavailable", () => {
	const catalog = readEditorCatalog({ ...fixture(), frontendTemplates: null }, digest);
	expect(catalog.frontendTemplates).toBeNull();
	expect(() => editorPalette(catalog)).toThrow("no verified frontend templates");
});

test("real template shape cannot enable a blocked source definition", () => {
	const response = fixture(false);
	const catalog = readEditorCatalog(response, digest);
	expect(catalog.frontendTemplates?.definitions[0]?.frontendTemplate).toBeDefined();
	expect(catalog.frontendTemplates?.allowedForPublication).toBe(false);
	expect(catalog.frontendTemplates?.blockers).toEqual(response.blockers);
	expect(() => editorPalette(catalog)).toThrow("no approved editor components");
	response.frontendTemplates.definitions[0]!.allowedForPublication = true;
	expect(() => readEditorCatalog(response, digest)).toThrow("source definition");
});

test.each(["componentManifestHash", "kind", "engineOverlayHash"] as const)("rejects invalid export %s", (key) => {
	const response = fixture();
	response.frontendTemplates[key] = "wrong";
	expect(() => readEditorCatalog(response, digest)).toThrow();
});

test("rejects another granted catalog, engine, component source, or native type", () => {
	const response = fixture();
	expect(() => readEditorCatalog(response, "d".repeat(64))).toThrow("granted catalog");
	const changedEngine = structuredClone(response);
	changedEngine.frontendTemplates.engine.commit = "a".repeat(40);
	expect(() => readEditorCatalog(changedEngine, digest)).toThrow("granted catalog");
	const changedSource = structuredClone(response);
	changedSource.frontendTemplates.definitions[0]!.source.sha256 = "e".repeat(64);
	expect(() => readEditorCatalog(changedSource, digest)).toThrow("source definition");
	const changedType = structuredClone(response);
	changedType.frontendTemplates.definitions[0]!.frontendTemplate.data.type = "AnotherComponent";
	expect(() => readEditorCatalog(changedType, digest)).toThrow("source definition");
});

test("rejects duplicate, extra, or missing template definitions", () => {
	const response = fixture();
	response.frontendTemplates.definitions.push(structuredClone(response.frontendTemplates.definitions[0]!));
	expect(() => readEditorCatalog(response, digest)).toThrow("source definitions");
	response.frontendTemplates.definitions = [];
	expect(() => readEditorCatalog(response, digest)).toThrow("source definitions");
});
