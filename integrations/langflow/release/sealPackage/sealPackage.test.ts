import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalBytes } from "../canonicalBytes";
import { inspectPackage } from "../inspectPackage";
import { loadCandidatePackage } from "../loadCandidatePackage";
import { verifyPackage } from "../verifyPackage";
import { packageFixture } from "./components/packageFixture";
import { sealPackage } from "./sealPackage";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(architecture: "arm64" | "x86_64" = "arm64") {
	const input = await packageFixture(architecture);
	roots.push(input.root);
	return input;
}

test.each(["arm64", "x86_64"] as const)("seals an offline %s candidate with a trusted digest", async (architecture) => {
	const input = await fixture(architecture);
	const output = join(input.root, "sealed");
	const result = await sealPackage({ ...input, output });
	expect((await verifyPackage(output, result.packageId)).recipe.target.architecture).toBe(architecture);
	const loaded = await loadCandidatePackage(output, result.packageId);
	expect(loaded.enginePackageDigest).toBe(result.packageId);
	expect(loaded.componentManifestHash).toBe(input.recipe.components.catalog.sha256);
	expect(loaded.qualification).toBe("candidate");
	expect(loaded.engine.layoutDirectory).toBe(join(output, "payload/image"));
	await rm(input.staging, { recursive: true });
	expect((await verifyPackage(output, result.packageId)).packageId).toBe(result.packageId);
	await expect(verifyPackage(output, "0".repeat(64))).rejects.toThrow("package_seal_mismatch");
});

test("ignores input times, modes, and JSON key order in the package identity", async () => {
	const input = await fixture();
	await sealPackage({ ...input, output: join(input.root, "first") });
	await chmod(join(input.staging, "uv.lock"), 0o755);
	await utimes(join(input.staging, "uv.lock"), 100, 100);
	const recipe = Object.fromEntries(Object.entries(input.recipe).reverse());
	await sealPackage({ ...input, recipe, output: join(input.root, "second") });
	expect(await readFile(join(input.root, "first/package.json"), "utf8")).toBe(
		await readFile(join(input.root, "second/package.json"), "utf8"),
	);
});

test.each(["uv.lock", "editor/index.html", "components/native.py", "patches/backend.patch", "LICENSE"])(
	"rejects altered input %s",
	async (path) => {
		const input = await fixture();
		await writeFile(join(input.staging, path), "altered");
		await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_input_mismatch");
	},
);

test("rejects missing image layers without a network fetch", async () => {
	const input = await fixture();
	await rm(join(input.staging, "image/blobs/sha256", input.layer.digest.slice(7)));
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("oci_blob_mismatch");
});

test("rejects the wrong image architecture", async () => {
	const input = await fixture();
	input.recipe.target.architecture = "x86_64";
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("oci_platform_mismatch");
});

test("rejects a symlink and an unlisted secret", async () => {
	const input = await fixture();
	await symlink("uv.lock", join(input.staging, "alias"));
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_symlink");
	await rm(join(input.staging, "alias"));
	await input.file("secrets/token", "private");
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_unlisted_file");
});

test("rejects runtime secrets, verified qualification, and an unsafe path", async () => {
	const input = await fixture();
	await expect(inspectPackage(input.staging, { ...input.recipe, encryptionSecret: "private" })).rejects.toThrow();
	await expect(inspectPackage(input.staging, { ...input.recipe, qualification: "verified" })).rejects.toThrow();
	input.recipe.source.archive.path = "../source.tar";
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow();
});

test("rejects changed patch order and digest", async () => {
	const input = await fixture();
	input.recipe.patchSet.patches[0]!.order = 1;
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_patch_order");
	input.recipe.patchSet.patches[0]!.order = 0;
	input.recipe.patchSet.sha256 = "0".repeat(64);
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_patch_digest");
});

test("detects payload and seal tampering after assembly", async () => {
	const input = await fixture();
	const output = join(input.root, "sealed");
	const result = await sealPackage({ ...input, output });
	await writeFile(join(output, "package.json"), `${JSON.stringify(result)}\n`);
	await expect(verifyPackage(output, result.packageId)).rejects.toThrow("package_seal_mismatch");
	await writeFile(join(output, "payload/uv.lock"), "changed");
	await expect(verifyPackage(output, result.packageId)).rejects.toThrow("package_input_mismatch");
});

test("does not overwrite an output or write beneath the input tree", async () => {
	const input = await fixture();
	await expect(sealPackage({ ...input, output: join(input.staging, "output") })).rejects.toThrow(
		"package_nested_output",
	);
	const output = join(input.root, "sealed");
	await sealPackage({ ...input, output });
	await expect(sealPackage({ ...input, output })).rejects.toThrow();
});

test("retains component support bytes after the source staging directory is removed", async () => {
	const input = await fixture();
	const support = await input.file("catalog/engine/loop_utils.py", "fixture loop dependency");
	input.recipe.componentSupportFiles = [support];
	const output = join(input.root, "sealed");
	const result = await sealPackage({ ...input, output });
	await rm(input.staging, { recursive: true });
	expect(await readFile(join(output, "payload", support.path), "utf8")).toBe("fixture loop dependency");
	expect((await verifyPackage(output, result.packageId)).recipe.componentSupportFiles).toEqual([support]);
	expect((await loadCandidatePackage(output, result.packageId)).qualification).toBe("candidate");
});

test.each(["changed", "missing"])("rejects %s component support bytes", async (state) => {
	const input = await fixture();
	const support = await input.file("catalog/trellis/readCatalog.py", "fixture catalog reader");
	input.recipe.componentSupportFiles = [support];
	if (state === "changed") await writeFile(join(input.staging, support.path), "changed");
	else await rm(join(input.staging, support.path));
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_input_mismatch");
});

test("keeps an omitted support inventory out of the stored recipe", async () => {
	const input = await fixture();
	const result = await inspectPackage(input.staging, input.recipe);
	expect(Object.hasOwn(result.recipe, "componentSupportFiles")).toBe(false);
	const expected = createHash("sha256")
		.update(canonicalBytes({ recipe: input.recipe, files: result.files }))
		.digest("hex");
	expect(result.packageId).toBe(expected);
});
