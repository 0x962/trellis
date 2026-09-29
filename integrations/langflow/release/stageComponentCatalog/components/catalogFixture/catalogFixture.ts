import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function catalogFixture() {
	const root = await mkdtemp(join(tmpdir(), "trellis-catalog-stage-"));
	const roots = { trellis: join(root, "source"), engine: join(root, "engine") };
	async function source(kind: "trellis" | "engine", path: string, bytes: string) {
		await mkdir(dirname(join(roots[kind], path)), { recursive: true });
		await writeFile(join(roots[kind], path), bytes);
		return { root: kind, path, sha256: createHash("sha256").update(bytes).digest("hex") };
	}
	const definition = await source("trellis", "integrations/langflow/components/native.py", "fixture definition");
	const runtime = await source("trellis", "integrations/langflow/components/catalog/__init__.py", "fixture imports");
	const reader = await source("trellis", "integrations/langflow/components/catalog/readCatalog.py", "fixture reader");
	const dependency = await source("engine", "src/loop_utils.py", "fixture dependency");
	const handle = await source("engine", "src/handles.ts", "fixture handles");
	const engineCommit = "fec71dca901949c09ed4d63315804337cd2eb13d";
	const manifest = {
		schemaVersion: 1,
		engine: { commit: engineCommit },
		allowedForPublication: false,
		definitions: [{ id: "native", source: definition, sourceDependencies: [dependency] }],
		runtimeSources: [runtime, reader],
		edgeHandles: { engineSource: dependency, frontendSource: handle },
	};
	const manifestPath = join(roots.trellis, "integrations/langflow/components/catalog/manifest.v1.json");
	const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
	await writeFile(manifestPath, manifestBytes);
	return {
		root,
		manifest,
		manifestBytes,
		manifestPath,
		input: {
			trellisRoot: roots.trellis,
			engineRoot: roots.engine,
			engineCommit,
			expectedManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
			output: join(root, "staged"),
		},
	};
}
