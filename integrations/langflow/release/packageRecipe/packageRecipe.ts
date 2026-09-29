import { z } from "zod";
import { LangflowSidecarManifestV1Schema } from "../../package-probe/sidecarManifest";

const sidecar = LangflowSidecarManifestV1Schema.shape;
const file = sidecar.source.shape.archive;
const path = file.shape.path;

export const PackageRecipeSchema = z.strictObject({
	schemaVersion: z.literal(1),
	qualification: z.literal("candidate"),
	source: sidecar.source.extend({
		tree: z.literal("e6ac634257b30645b6c35bcc707ed271789877d6"),
	}),
	patchSet: z.strictObject({
		sha256: file.shape.sha256,
		patches: z.array(
			sidecar.patchSet.shape.patches.element.extend({
				directory: z.union([z.literal("."), path]),
			}),
		),
	}),
	lock: sidecar.lock,
	components: sidecar.components,
	python: sidecar.python.extend({ version: z.literal("3.12.12") }),
	target: z.strictObject({
		kind: z.literal("linux-oci"),
		architecture: z.enum(["arm64", "x86_64"]),
		image: z.string().min(1),
		imageDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
		layout: path,
	}),
	editor: sidecar.editor.extend({ lock: file }),
	license: sidecar.license,
	dependencies: file,
});

export type PackageRecipe = z.infer<typeof PackageRecipeSchema>;
