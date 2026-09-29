import { FlowDigestV1Schema, type FlowHarness, FlowHarnessSchema, FlowSchema } from "@trellis/api";
import { z } from "zod";
import { ResolvedConversionHarnessSchema } from "../resolvedConversionHarness";

export const NativePolicyConfigurationV1Schema = z.strictObject({
	schemaVersion: z.literal(1),
	source: z.strictObject({
		flowId: FlowSchema.shape.id,
		version: FlowSchema.shape.version,
		sha256: FlowDigestV1Schema,
	}),
	packageIdentity: z.strictObject({
		enginePackageDigest: FlowDigestV1Schema,
		componentManifestHash: FlowDigestV1Schema,
		engineOverlayHash: FlowDigestV1Schema,
	}),
	nativePolicies: z.record(
		FlowSchema.shape.id,
		z.strictObject({
			sourceHarness: z.custom<FlowHarness | null>((value) => FlowHarnessSchema.nullable().safeParse(value).success),
			harness: ResolvedConversionHarnessSchema,
		}),
	),
});

export type NativePolicyConfigurationV1 = z.infer<typeof NativePolicyConfigurationV1Schema>;
