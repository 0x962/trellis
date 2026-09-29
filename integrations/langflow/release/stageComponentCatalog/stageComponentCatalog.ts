import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { PackageRecipe } from "../packageRecipe";
import { CatalogManifestSchema } from "./components/catalogManifest";

type DigestFile = PackageRecipe["components"]["catalog"];
export type StagedComponentCatalog = {
	components: PackageRecipe["components"];
	componentSupportFiles: DigestFile[];
	roots: { trellis: string; engine: string };
};

export async function stageComponentCatalog(input: {
	trellisRoot: string;
	engineRoot: string;
	expectedManifestSha256: string;
	engineCommit: string;
	output: string;
}): Promise<StagedComponentCatalog> {
	const roots = { trellis: await realpath(input.trellisRoot), engine: await realpath(input.engineRoot) };
	const manifestRelative = "integrations/langflow/components/catalog/manifest.v1.json";
	const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
	async function readSource(root: string, path: string) {
		const absolute = join(root, path);
		if ((await realpath(absolute)) !== absolute || !(await lstat(absolute)).isFile()) {
			throw new Error(`catalog_source_not_regular: ${path}`);
		}
		return readFile(absolute);
	}
	const manifestBytes = await readSource(roots.trellis, manifestRelative);
	if (digest(manifestBytes) !== input.expectedManifestSha256) throw new Error("catalog_manifest_digest_conflict");
	const manifest = CatalogManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
	if (manifest.engine.commit !== input.engineCommit) throw new Error("catalog_engine_identity_conflict");
	const definitions = manifest.definitions;
	if (new Set(definitions.map((definition) => definition.id)).size !== definitions.length) {
		throw new Error("catalog_duplicate_component");
	}
	const supportSources = [
		...definitions.flatMap((definition) => definition.sourceDependencies),
		...manifest.runtimeSources,
		manifest.edgeHandles.engineSource,
		manifest.edgeHandles.frontendSource,
	];
	const sources = [...definitions.map((definition) => definition.source), ...supportSources];
	const files = new Map<string, { bytes: Buffer; reference: DigestFile }>();
	const packagePath = (source: { root: string; path: string }) => `catalog/${source.root}/${source.path}`;
	for (const source of sources) {
		const bytes = await readSource(roots[source.root], source.path);
		if (digest(bytes) !== source.sha256) throw new Error(`catalog_source_digest_conflict: ${source.path}`);
		const path = packagePath(source);
		const prior = files.get(path);
		if (prior && prior.reference.sha256 !== source.sha256) throw new Error(`catalog_source_conflict: ${path}`);
		files.set(path, { bytes, reference: { path, sha256: source.sha256, sizeBytes: bytes.byteLength } });
	}
	const catalogPath = `catalog/trellis/${manifestRelative}`;
	if (files.has(catalogPath)) throw new Error("catalog_manifest_source_conflict");
	const catalog = { path: catalogPath, sha256: input.expectedManifestSha256, sizeBytes: manifestBytes.byteLength };
	files.set(catalogPath, { bytes: manifestBytes, reference: catalog });
	const output = resolve(input.output);
	for (const root of Object.values(roots)) {
		const distance = relative(root, output);
		if (distance === "" || (!distance.startsWith("../") && distance !== "..")) {
			throw new Error("catalog_output_inside_source");
		}
	}
	await mkdir(output, { mode: 0o700 });
	for (const [path, file] of files) {
		const destination = join(output, path);
		await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
		await writeFile(destination, file.bytes, { flag: "wx", mode: 0o600 });
		if (digest(await readFile(destination)) !== file.reference.sha256) throw new Error(`catalog_copy_digest: ${path}`);
	}
	const entries = definitions.map((definition) => ({
		id: definition.id,
		source: files.get(packagePath(definition.source))!.reference,
	}));
	const definitionPaths = new Set(entries.map((entry) => entry.source.path));
	const supportPaths = [...new Set(supportSources.map(packagePath))].filter((path) => !definitionPaths.has(path));
	return {
		components: { catalog, entries },
		componentSupportFiles: supportPaths.map((path) => files.get(path)!.reference),
		roots: { trellis: join(output, "catalog/trellis"), engine: join(output, "catalog/engine") },
	};
}
