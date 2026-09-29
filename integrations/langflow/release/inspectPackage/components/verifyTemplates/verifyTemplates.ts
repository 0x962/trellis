import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PackageRecipe } from "../../../packageRecipe";

const TemplateIdentitySchema = z.object({
	schemaVersion: z.literal(1),
	kind: z.literal("trellis-frontend-templates"),
	componentManifestHash: z.string(),
	engineOverlayHash: z.string(),
	engine: z.object({ commit: z.string() }),
});

export async function verifyTemplates(root: string, recipe: PackageRecipe) {
	if (!recipe.frontendTemplates) return;
	const bytes = await readFile(join(root, recipe.frontendTemplates.path));
	if (createHash("sha256").update(bytes).digest("hex") !== recipe.frontendTemplates.sha256) {
		throw new Error("package_templates_changed");
	}
	const identity = TemplateIdentitySchema.parse(JSON.parse(bytes.toString("utf8")));
	if (
		identity.componentManifestHash !== recipe.components.catalog.sha256 ||
		identity.engineOverlayHash !== recipe.patchSet.sha256 ||
		identity.engine.commit !== recipe.source.commit
	) {
		throw new Error("package_templates_identity_conflict");
	}
}
