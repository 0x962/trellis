import { z } from "zod";
import { LangflowSidecarManifestV1Schema } from "../../package-probe/sidecarManifest";

const sidecar = LangflowSidecarManifestV1Schema.shape;

export const QualificationRuntimeSchema = z.strictObject({
	data: sidecar.data.extend({ privateRoot: z.literal("data") }),
	encryptionSecret: sidecar.encryptionSecret.extend({
		relativePath: z.literal("run/trellis-secrets/engine-secret"),
	}),
	health: sidecar.health.extend({ path: z.literal("/trellis-v1/health") }),
	epochOwnership: sidecar.epochOwnership,
});

export type QualificationRuntime = z.infer<typeof QualificationRuntimeSchema>;
