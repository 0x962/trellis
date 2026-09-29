import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { catalogFixture } from "./components/catalogFixture";
import { stageComponentCatalog } from "./stageComponentCatalog";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
	const value = await catalogFixture();
	roots.push(value.root);
	return value;
}

test("retains the catalog and both source roots without a checkout", async () => {
	const { input, manifestBytes, manifest } = await fixture();
	const result = await stageComponentCatalog(input);
	await rm(input.trellisRoot, { recursive: true });
	await rm(input.engineRoot, { recursive: true });
	expect(await readFile(join(input.output, result.components.catalog.path), "utf8")).toBe(manifestBytes);
	expect(JSON.parse(manifestBytes).allowedForPublication).toBe(false);
	expect(result.components.entries.map((entry) => entry.id)).toEqual(["native"]);
	expect(result.componentSupportFiles).toHaveLength(4);
	for (const source of [
		...manifest.runtimeSources,
		manifest.definitions[0]!.source,
		...manifest.definitions[0]!.sourceDependencies,
		manifest.edgeHandles.frontendSource,
	]) {
		const bytes = await readFile(join(result.roots[source.root], source.path));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);
	}
});

test("rejects a changed manifest or mismatched engine identity", async () => {
	const { input } = await fixture();
	await expect(stageComponentCatalog({ ...input, expectedManifestSha256: "0".repeat(64) })).rejects.toThrow(
		"catalog_manifest_digest_conflict",
	);
	await expect(stageComponentCatalog({ ...input, engineCommit: "0".repeat(40) })).rejects.toThrow(
		"catalog_engine_identity_conflict",
	);
});

test.each(["definition", "runtime", "dependency"])("rejects changed %s bytes", async (kind) => {
	const { input, manifest } = await fixture();
	const source =
		kind === "definition"
			? manifest.definitions[0]!.source
			: kind === "runtime"
				? manifest.runtimeSources[0]!
				: manifest.definitions[0]!.sourceDependencies[0]!;
	const root = source.root === "trellis" ? input.trellisRoot : input.engineRoot;
	await writeFile(join(root, source.path), "changed");
	await expect(stageComponentCatalog(input)).rejects.toThrow("catalog_source_digest_conflict");
});

test("rejects a source symlink", async () => {
	const { input, manifest } = await fixture();
	const source = join(input.trellisRoot, manifest.runtimeSources[0]!.path);
	await rm(source);
	await symlink(input.engineRoot, source);
	await expect(stageComponentCatalog(input)).rejects.toThrow("catalog_source_not_regular");
});

test("rejects an escaping path even when the caller trusts the manifest digest", async () => {
	const { input, manifest, manifestPath } = await fixture();
	manifest.runtimeSources[0]!.path = "../outside.py";
	const bytes = JSON.stringify(manifest);
	await writeFile(manifestPath, bytes);
	input.expectedManifestSha256 = createHash("sha256").update(bytes).digest("hex");
	await expect(stageComponentCatalog(input)).rejects.toThrow();
});

test("rejects an existing output", async () => {
	const { input } = await fixture();
	await stageComponentCatalog(input);
	await expect(stageComponentCatalog(input)).rejects.toThrow();
});

test("rejects output beneath a source root", async () => {
	const { input } = await fixture();
	await expect(stageComponentCatalog({ ...input, output: join(input.trellisRoot, "staged") })).rejects.toThrow(
		"catalog_output_inside_source",
	);
});
