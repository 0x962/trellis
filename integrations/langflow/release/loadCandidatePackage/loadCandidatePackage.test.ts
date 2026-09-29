import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { canonicalBytes } from "../canonicalBytes";
import { inspectPackage } from "../inspectPackage";
import { sealPackage } from "../sealPackage";
import { packageFixture } from "../sealPackage/components/packageFixture";
import { loadCandidatePackage } from "./loadCandidatePackage";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
	const input = await packageFixture();
	roots.push(input.root);
	const envelope = {
		schemaVersion: 1,
		kind: "trellis-frontend-templates",
		catalogId: "fixture",
		componentManifestHash: input.recipe.components.catalog.sha256,
		engineOverlayHash: input.recipe.patchSet.sha256,
		engine: { name: "langflow", version: "1.12.3", commit: String(input.recipe.source.commit) },
		allowedForPublication: false,
		supportedMappings: [],
		legacyMappings: [{ id: "agent", status: "blocked" }],
		blockers: { ENGINE_TRACE_REQUIRED: "The engine trace is required." },
		definitions: [],
	};
	return { ...input, envelope };
}

test("retains original export bytes with the catalog and overlay identities", async () => {
	const input = await fixture();
	const bytes = `${JSON.stringify(input.envelope, null, 2)}\n`;
	input.recipe.frontendTemplates = await input.file("frontend-templates.v1.json", bytes);
	const output = join(input.root, "sealed");
	const sealed = await sealPackage({ ...input, output });
	await rm(input.staging, { recursive: true });
	const loaded = await loadCandidatePackage(output, sealed.packageId);
	expect(loaded.frontendTemplates).toEqual({
		path: join(output, "payload/frontend-templates.v1.json"),
		sha256: input.recipe.frontendTemplates.sha256,
		engineOverlayHash: input.recipe.patchSet.sha256,
	});
	expect(Object.isFrozen(loaded.frontendTemplates)).toBe(true);
	expect(loaded.componentManifestPath).toBe(join(output, "payload", input.recipe.components.catalog.path));
	expect(loaded.engineOverlayHash).toBe(input.recipe.patchSet.sha256);
	expect(await readFile(loaded.frontendTemplates!.path, "utf8")).toBe(bytes);
	expect(loaded.qualification).toBe("candidate");
});

test.each(["catalog", "overlay", "engine"])("rejects a trusted export with a different %s identity", async (kind) => {
	const input = await fixture();
	if (kind === "catalog") input.envelope.componentManifestHash = "0".repeat(64);
	if (kind === "overlay") input.envelope.engineOverlayHash = "0".repeat(64);
	if (kind === "engine") input.envelope.engine.commit = "0".repeat(40);
	input.recipe.frontendTemplates = await input.file("frontend-templates.v1.json", JSON.stringify(input.envelope));
	await expect(inspectPackage(input.staging, input.recipe)).rejects.toThrow("package_templates_identity_conflict");
});

test("leaves an absent export out of package identity and returns null", async () => {
	const input = await fixture();
	const output = join(input.root, "sealed");
	const result = await sealPackage({ ...input, output });
	expect(Object.hasOwn(result.recipe, "frontendTemplates")).toBe(false);
	expect(result.packageId).toBe(
		createHash("sha256")
			.update(canonicalBytes({ recipe: input.recipe, files: result.files }))
			.digest("hex"),
	);
	expect((await loadCandidatePackage(output, result.packageId)).frontendTemplates).toBeNull();
});
