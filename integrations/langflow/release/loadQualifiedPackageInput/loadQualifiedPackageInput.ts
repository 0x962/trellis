import { isAbsolute } from "node:path";
import { z } from "zod";
import { QualificationRuntimeSchema } from "../qualificationRuntime";

const absolutePath = z.string().min(1).refine(isAbsolute);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const LoadQualifiedPackageInputSchema = z.strictObject({
	packageRoot: absolutePath,
	packageId: sha256,
	qualificationFile: absolutePath,
	qualificationSha256: sha256,
	dataHomeId: z.string().min(1),
	runtime: QualificationRuntimeSchema,
});

export type LoadQualifiedPackageInput = z.infer<typeof LoadQualifiedPackageInputSchema>;
