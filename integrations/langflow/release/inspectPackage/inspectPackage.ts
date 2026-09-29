import { createHash } from "node:crypto";
import { canonicalBytes } from "../canonicalBytes";
import { PackageRecipeSchema } from "../packageRecipe";
import { type PayloadFile, payloadFiles } from "../payloadFiles";
import { verifyOci } from "./components/verifyOci";

export async function inspectPackage(root: string, input: unknown) {
	const recipe = PackageRecipeSchema.parse(input);
	const files = await payloadFiles(root);
	const byPath = new Map(files.map((file) => [file.path, file]));
	const required = await verifyOci(root, recipe.target, byPath);
	const references: PayloadFile[] = [
		recipe.source.archive,
		recipe.lock,
		recipe.dependencies,
		recipe.components.catalog,
		recipe.editor.lock,
		recipe.license.file,
		...recipe.patchSet.patches,
		...recipe.components.entries.map((entry) => entry.source),
		...recipe.editor.assets,
	];
	for (const reference of references) {
		const actual = byPath.get(reference.path);
		if (!actual || actual.sha256 !== reference.sha256 || actual.sizeBytes !== reference.sizeBytes) {
			throw new Error(`package_input_mismatch: ${reference.path}`);
		}
		required.add(reference.path);
	}
	if (new Set(recipe.components.entries.map((entry) => entry.id)).size !== recipe.components.entries.length) {
		throw new Error("package_duplicate_component");
	}
	if (
		new Set(recipe.patchSet.patches.map((patch) => patch.id)).size !== recipe.patchSet.patches.length ||
		recipe.patchSet.patches.some((patch, index) => patch.order !== index)
	)
		throw new Error("package_patch_order");
	const patchDigest = createHash("sha256").update(canonicalBytes(recipe.patchSet.patches)).digest("hex");
	if (patchDigest !== recipe.patchSet.sha256) throw new Error("package_patch_digest");
	if (recipe.editor.assets.some((asset) => !asset.path.startsWith(`${recipe.editor.root}/`))) {
		throw new Error("package_editor_path");
	}
	if (!recipe.editor.assets.some((asset) => asset.path === `${recipe.editor.root}/index.html`)) {
		throw new Error("package_editor_entry_missing");
	}
	for (const file of files) {
		if (!required.has(file.path)) throw new Error(`package_unlisted_file: ${file.path}`);
	}
	const content = { recipe, files };
	const packageId = createHash("sha256").update(canonicalBytes(content)).digest("hex");
	return { packageId, ...content };
}
