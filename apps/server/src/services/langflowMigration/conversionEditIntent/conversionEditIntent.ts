import { FlowDigestV1Schema, type FlowHarness, FlowHarnessSchema, UlidSchema } from "@trellis/api";
import { z } from "zod";

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

export const ConversionEditIntentV1Schema = z.strictObject({
	schemaVersion: z.literal(1),
	flowId: UlidSchema,
	expectedVersion: z.number().int().positive(),
	expectedDocumentHash: FlowDigestV1Schema,
	componentManifestHash: FlowDigestV1Schema,
	enginePackageDigest: FlowDigestV1Schema,
	requestId: z.uuid(),
	edits: z.array(edits).min(1),
});

export type ConversionEditIntentV1 = z.infer<typeof ConversionEditIntentV1Schema>;
