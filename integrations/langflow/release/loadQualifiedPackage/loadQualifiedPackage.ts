import { isDeepStrictEqual } from "node:util";
import { LangflowSidecarManifestV1Schema } from "../../package-probe/sidecarManifest";
import { inspectCandidatePackage } from "../inspectCandidatePackage";
import { type LoadQualifiedPackageInput, LoadQualifiedPackageInputSchema } from "../loadQualifiedPackageInput";
import { readQualification } from "./components/readQualification";

export async function loadQualifiedPackage(input: LoadQualifiedPackageInput) {
	const options = LoadQualifiedPackageInputSchema.parse(input);
	const { runtime } = options;
	if (runtime.data.dataHomeId !== options.dataHomeId || runtime.epochOwnership.dataHomeId !== options.dataHomeId) {
		throw new Error("qualification_data_home_mismatch");
	}
	const proof = await readQualification(options.qualificationFile, options.qualificationSha256);
	const { candidate, recipe } = await inspectCandidatePackage(options.packageRoot, options.packageId);
	if (!candidate.frontendTemplates) throw new Error("qualification_templates_required");
	if (
		proof.subject.packageId !== candidate.enginePackageDigest ||
		proof.subject.imageConfigDigest !== candidate.engine.imageConfigDigest ||
		!isDeepStrictEqual(proof.subject.recipe, recipe)
	) {
		throw new Error("qualification_subject_mismatch");
	}
	const manifest = LangflowSidecarManifestV1Schema.parse({
		schemaVersion: 1,
		qualification: "verified",
		source: recipe.source,
		patchSet: {
			sha256: recipe.patchSet.sha256,
			patches: recipe.patchSet.patches.map(({ directory: _directory, ...patch }) => patch),
		},
		lock: recipe.lock,
		components: recipe.components,
		python: recipe.python,
		target: {
			kind: recipe.target.kind,
			architecture: recipe.target.architecture,
			image: recipe.target.image,
			imageDigest: recipe.target.imageDigest,
		},
		editor: { root: recipe.editor.root, assets: recipe.editor.assets },
		license: recipe.license,
		...runtime,
	});
	return Object.freeze({ candidate, manifest: freezeValue(manifest), qualificationSha256: options.qualificationSha256 });
}

function freezeValue<T>(value: T): T {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freezeValue(child);
		Object.freeze(value);
	}
	return value;
}
