import { z } from "zod";
import { DeliveryAuthorityV1Schema } from "../authority";
import {
	DigestSchema,
	EngineJobBindingV1Schema,
	OccurrenceV1Schema,
	ReferenceSchema,
	RevisionSchema,
	TimestampSchema,
} from "../primitives";

export const HumanWaitV1Schema = z.strictObject({
	version: z.literal(1),
	...EngineJobBindingV1Schema.shape,
	occurrence: OccurrenceV1Schema,
	engineRequestId: ReferenceSchema,
	actionKey: ReferenceSchema,
	expectedRevision: RevisionSchema,
	deadlineRefs: z.array(ReferenceSchema),
});
export const HumanDecisionReceiptV1Schema = z.strictObject({
	version: z.literal(1),
	decisionId: ReferenceSchema,
	wait: HumanWaitV1Schema,
	actor: z.strictObject({ kind: z.literal("human"), name: z.string().min(1) }),
	approved: z.boolean(),
	output: z.string(),
	recordedAt: TimestampSchema,
});
export const DecisionLookupRequestV1Schema = z.strictObject({
	version: z.literal(1),
	executionId: ReferenceSchema,
	engineJobId: z.uuid(),
	engineRequestId: ReferenceSchema,
	decisionId: ReferenceSchema,
	payloadDigest: DigestSchema,
});
export const DecisionDeliveryV1Schema = z
	.strictObject({
		version: z.literal(1),
		decision: HumanDecisionReceiptV1Schema,
		payloadDigest: DigestSchema,
		authority: DeliveryAuthorityV1Schema,
	})
	.refine(
		({ decision, authority }) =>
			decision.wait.executionId === authority.executionId &&
			decision.wait.publicationId === authority.publicationId &&
			decision.wait.engineJobId === authority.engineJobId &&
			decision.wait.engineEpoch <= authority.engineEpoch &&
			authority.permissions.includes("decision.deliver"),
		"Decision delivery requires current authority for the original human wait.",
	);
export const DecisionAcceptanceV1Schema = z.strictObject({
	...DecisionLookupRequestV1Schema.shape,
	acceptanceId: ReferenceSchema,
	signalId: ReferenceSchema,
	enqueueObligationId: ReferenceSchema,
	acceptedAt: TimestampSchema,
});
export const DecisionLookupResultV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("accepted"), receipt: DecisionAcceptanceV1Schema }),
	z.strictObject({ state: z.literal("absent"), lookup: DecisionLookupRequestV1Schema, authoritative: z.literal(true) }),
	z.strictObject({ state: z.literal("unknown"), lookup: DecisionLookupRequestV1Schema }),
	z.strictObject({ state: z.literal("conflict"), lookup: DecisionLookupRequestV1Schema, acceptedDigest: DigestSchema }),
]);
const delivery = { version: z.literal(1), decision: HumanDecisionReceiptV1Schema, payloadDigest: DigestSchema };
export const HumanDeliveryV1Schema = z
	.discriminatedUnion("state", [
		z.strictObject({ ...delivery, state: z.enum(["recorded", "pending", "unknown"]), acceptance: z.null() }),
		z.strictObject({ ...delivery, state: z.literal("confirmed"), acceptance: DecisionAcceptanceV1Schema }),
	])
	.refine(
		(value) =>
			value.state !== "confirmed" ||
			(value.acceptance.decisionId === value.decision.decisionId &&
				value.acceptance.payloadDigest === value.payloadDigest &&
				value.acceptance.executionId === value.decision.wait.executionId &&
				value.acceptance.engineJobId === value.decision.wait.engineJobId &&
				value.acceptance.engineRequestId === value.decision.wait.engineRequestId),
		"Confirmation requires acceptance of the exact decision and human wait.",
	);
export type HumanWaitV1 = z.infer<typeof HumanWaitV1Schema>;
export type DecisionDeliveryV1 = z.infer<typeof DecisionDeliveryV1Schema>;
export type HumanDecisionReceiptV1 = z.infer<typeof HumanDecisionReceiptV1Schema>;
export type DecisionAcceptanceV1 = z.infer<typeof DecisionAcceptanceV1Schema>;
export type DecisionLookupRequestV1 = z.infer<typeof DecisionLookupRequestV1Schema>;
export type DecisionLookupResultV1 = z.infer<typeof DecisionLookupResultV1Schema>;
export type HumanDeliveryV1 = z.infer<typeof HumanDeliveryV1Schema>;
