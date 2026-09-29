import { z } from "zod";
import { type FlowHarness, FlowHarnessSchema } from "./flow.ts";
import { FlowDiagnosticV1Schema, FlowDigestV1Schema, FlowDocumentV1Schema } from "./flowDocumentV1.ts";
import { UlidSchema } from "./primitives.ts";

const harness = z.custom<FlowHarness>((value) => FlowHarnessSchema.safeParse(value).success).nullable();
const sourceNodeId = UlidSchema;
const edits = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("set-flow-briefing"), briefing: z.string() }),
	z.strictObject({ kind: z.literal("set-flow-harness"), harness }),
	z.strictObject({ kind: z.literal("set-node-instruction"), sourceNodeId, instruction: z.string() }),
	z.strictObject({ kind: z.literal("set-node-harness"), sourceNodeId, harness }),
	z.strictObject({
		kind: z.literal("set-group-policy"), sourceNodeId,
		parallel: z.boolean(), minutes: z.number().int().positive().nullable(),
	}),
	z.strictObject({ kind: z.literal("set-loop-rounds"), sourceNodeId, maxRounds: z.number().int().positive() }),
]);

export const PublishDocumentV1InputSchema = z.strictObject({
	flowId: UlidSchema,
	expectedVersion: z.number().int().positive(),
	expectedDocumentHash: FlowDigestV1Schema,
	componentManifestHash: FlowDigestV1Schema,
	enginePackageDigest: FlowDigestV1Schema,
	requestId: z.uuid(),
});
export type PublishDocumentV1Input = z.infer<typeof PublishDocumentV1InputSchema>;

export const ActivateConversionV1InputSchema = PublishDocumentV1InputSchema;
export type ActivateConversionV1Input = z.infer<typeof ActivateConversionV1InputSchema>;

export const ConversionEditIntentV1Schema = z.strictObject({
	schemaVersion: z.literal(1),
	...PublishDocumentV1InputSchema.shape,
	edits: z.array(edits).min(1),
});
export type ConversionEditIntentV1 = z.infer<typeof ConversionEditIntentV1Schema>;

export const FlowDocumentActionResultV1Schema = z.union([
	z.strictObject({ requestId: z.uuid(), document: FlowDocumentV1Schema }),
	z.strictObject({ state: z.literal("blocked"), diagnostics: z.array(FlowDiagnosticV1Schema) }),
	z.strictObject({ state: z.literal("pending"), requestId: z.uuid() }),
]);
export type FlowDocumentActionResultV1 = z.infer<typeof FlowDocumentActionResultV1Schema>;
