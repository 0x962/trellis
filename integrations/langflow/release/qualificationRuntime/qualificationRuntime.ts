import { z } from "zod";
import { LangflowSidecarManifestV1Schema } from "../../package-probe/sidecarManifest";

const sidecar = LangflowSidecarManifestV1Schema.shape;

export const QualificationRuntimeSchema = z.strictObject({
	data: sidecar.data,
	encryptionSecret: sidecar.encryptionSecret,
	health: sidecar.health,
	epochOwnership: sidecar.epochOwnership,
});

export type QualificationRuntime = z.infer<typeof QualificationRuntimeSchema>;
