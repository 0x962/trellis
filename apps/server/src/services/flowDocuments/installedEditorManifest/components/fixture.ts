import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CandidatePackage } from "../../../../../../../integrations/langflow/release/loadCandidatePackage";

export async function manifestFixture() {
	const directory = await mkdtemp(join(tmpdir(), "trellis-editor-manifest-"));
	const digest = (value: string) => createHash("sha256").update(value).digest("hex");
	const code = "# installed fixture source\n";
	const source = { root: "trellis", path: "components/native.py", sha256: digest(code) };
	const entry = {
		id: "native",
		version: 1,
		className: "Native",
		source,
		qualification: "source-only",
		allowedForPublication: false,
	};
	const catalog = {
		schemaVersion: 1,
		catalogId: "test",
		engine: { name: "langflow", version: "1.12.3", commit: "a".repeat(40) },
		allowedForPublication: false,
		supportedMappings: [],
		legacyMappings: [{ id: "native", status: "blocked", blockerCodes: ["TRACE_REQUIRED"] }],
		blockers: { TRACE_REQUIRED: "The component needs a runtime trace." },
		definitions: [{ ...entry, sourceDependencies: [], frontendTemplate: null }],
		runtimeSources: [],
		edgeHandles: { engineSource: source, frontendSource: source },
	};
	const nativeNode = {
		display_name: "Native",
		description: "A component.",
		template: {
			code: { value: code, type: "code" },
			text: { value: "initial", type: "str", advanced: false, password: true },
			minutes: { value: null as number | null, type: "int" },
		},
		outputs: [
			{
				name: "result",
				types: ["Data", "Message"],
				method: "result",
				group_outputs: false,
				allows_loop: false,
				selected: "Data" as string | undefined,
			},
		],
	};
	const frontendTemplate = { id: "catalog-native", data: { id: "catalog-native", type: "Native", node: nativeNode } };
	const catalogBytes = JSON.stringify(catalog);
	const hash = digest(catalogBytes);
	const overlay = "b".repeat(64);
	const envelope = {
		schemaVersion: 1,
		kind: "trellis-frontend-templates",
		catalogId: catalog.catalogId,
		componentManifestHash: hash,
		engine: catalog.engine,
		engineOverlayHash: overlay,
		allowedForPublication: catalog.allowedForPublication,
		supportedMappings: catalog.supportedMappings,
		legacyMappings: catalog.legacyMappings,
		blockers: catalog.blockers,
		definitions: [{ ...entry, frontendTemplate }],
	};
	const catalogPath = join(directory, "catalog.json");
	const templatePath = join(directory, "templates.json");
	await writeFile(catalogPath, catalogBytes);
	const identity: CandidatePackage = {
		qualification: "candidate",
		enginePackageDigest: "d".repeat(64),
		componentManifestHash: hash,
		componentManifestPath: catalogPath,
		engineOverlayHash: overlay,
		targetArchitecture: "arm64",
		engine: {
			layoutDirectory: directory,
			image: "fixture",
			imageDigest: "sha256:fixture",
			imageConfigDigest: "sha256:fixture",
		},
		editor: { rootDirectory: directory },
		frontendTemplates: null,
		manifestPath: join(directory, "package.json"),
	};
	const sealTemplates = async () => {
		const bytes = JSON.stringify(envelope);
		await writeFile(templatePath, bytes);
		return {
			...identity,
			frontendTemplates: { path: templatePath, sha256: digest(bytes), engineOverlayHash: overlay },
		};
	};
	const node = {
		id: "instance",
		data: { ...structuredClone(frontendTemplate.data), id: "instance" },
		position: { x: 0, y: 0 },
	};
	const content = {
		schemaVersion: 1 as const,
		engine: "langflow" as const,
		componentManifestHash: hash,
		graphDocument: { nodes: [node], edges: [] },
	};
	return { directory, catalog, envelope, identity, sealTemplates, content, node, catalogPath, templatePath };
}
