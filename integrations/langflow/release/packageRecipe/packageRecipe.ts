import { z } from "zod";
import { LangflowSidecarManifestV1Schema } from "../../package-probe/sidecarManifest";

const sidecar = LangflowSidecarManifestV1Schema.shape;
const DigestFileSchema = sidecar.source.shape.archive;
const RelativePathSchema = DigestFileSchema.shape.path;

export const PackageRecipeSchema = z.strictObject({
	schemaVersion: z.literal(1),
	qualification: z.literal("candidate"),
	source: sidecar.source.extend({
		tree: z.literal("e6ac634257b30645b6c35bcc707ed271789877d6"),
	}),
	patchSet: z.strictObject({
		sha256: DigestFileSchema.shape.sha256,
		patches: z.array(
			sidecar.patchSet.shape.patches.element.extend({
				directory: z.union([z.literal("."), RelativePathSchema]),
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
		layout: RelativePathSchema,
	}),
	editor: sidecar.editor.extend({ lock: DigestFileSchema }),
	license: sidecar.license,
	dependencies: DigestFileSchema,
});

export type PackageRecipe = z.infer<typeof PackageRecipeSchema>;
