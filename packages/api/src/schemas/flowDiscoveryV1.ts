import { z } from "zod";
import { FlowSummarySchema } from "./flow.ts";
import {
	FlowDiagnosticV1Schema,
	FlowDigestV1Schema,
	FlowEngineV1Schema,
	FlowPublicationStateV1Schema,
	FlowPublicationV1Schema,
	FlowRevisionV1Schema,
} from "./flowDocumentV1.ts";
import { IsoDateTimeSchema } from "./primitives.ts";

export const FlowEngineAvailabilityV1Schema = z.union([
	z.strictObject({
		state: z.literal("available"),
		observedAt: IsoDateTimeSchema,
		enginePackageDigest: FlowDigestV1Schema,
		componentManifestHash: FlowDigestV1Schema,
	}),
	z.strictObject({
		state: z.enum(["unavailable", "unknown"]),
		observedAt: IsoDateTimeSchema.nullable(),
		reason: z.string().min(1),
	}),
]);
export const FlowCapabilityV1Schema = z.union([
	z.strictObject({ state: z.literal("allowed") }),
	z.strictObject({ state: z.enum(["blocked", "unknown"]), reason: z.string().min(1) }),
]);
export const FlowCompatibilityV1Schema = z.union([
	z.strictObject({ state: z.literal("compatible") }),
	z.strictObject({
		state: z.enum(["needs_migration", "blocked", "unknown"]),
		diagnostics: z.array(FlowDiagnosticV1Schema),
	}),
]);
export const FlowDiscoveryEntryV1Schema = z.strictObject({
	flow: FlowSummarySchema,
	engine: FlowEngineV1Schema,
	revision: FlowRevisionV1Schema,
	documentHash: FlowDigestV1Schema.nullable(),
	componentManifestHash: FlowDigestV1Schema.nullable(),
	diagnostics: z.array(FlowDiagnosticV1Schema),
	publication: FlowPublicationStateV1Schema,
	lastExecutablePublication: FlowPublicationV1Schema.nullable(),
	compatibility: FlowCompatibilityV1Schema,
	capabilities: z.strictObject({
		edit: FlowCapabilityV1Schema,
		delete: FlowCapabilityV1Schema,
		convert: FlowCapabilityV1Schema,
		start: FlowCapabilityV1Schema,
	}),
});
export const FlowDiscoveryV1Schema = z.strictObject({
	engine: FlowEngineAvailabilityV1Schema,
	entries: z.array(FlowDiscoveryEntryV1Schema),
});
export type FlowEngineAvailabilityV1 = z.infer<typeof FlowEngineAvailabilityV1Schema>;
export type FlowCapabilityV1 = z.infer<typeof FlowCapabilityV1Schema>;
export type FlowCompatibilityV1 = z.infer<typeof FlowCompatibilityV1Schema>;
export type FlowDiscoveryEntryV1 = z.infer<typeof FlowDiscoveryEntryV1Schema>;
export type FlowDiscoveryV1 = z.infer<typeof FlowDiscoveryV1Schema>;
