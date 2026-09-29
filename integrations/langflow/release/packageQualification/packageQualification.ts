import { z } from "zod";
import { PackageRecipeSchema } from "../packageRecipe";

const digestFile = PackageRecipeSchema.shape.source.shape.archive;
const probe = z.strictObject({
	command: z.string().min(1),
	result: z.literal("passed"),
	scope: z.string().min(1),
	evidence: digestFile,
});

export const PackageQualificationSchema = z.strictObject({
	schemaVersion: z.literal(1),
	kind: z.literal("trellis-package-qualification"),
	subject: z.strictObject({
		packageId: digestFile.shape.sha256,
		recipe: PackageRecipeSchema,
		imageConfigDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
	}),
	probes: z.strictObject({
		isolation: probe,
		offlineImport: probe,
		restartRetention: probe,
		lifecycle: probe,
		nativeSessionRetention: probe,
	}),
});

export type PackageQualification = z.infer<typeof PackageQualificationSchema>;
