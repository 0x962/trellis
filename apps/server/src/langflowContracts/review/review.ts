import { z } from "zod";
import { DeliveryAuthorityV1Schema } from "../authority";
import {
	DigestSchema,
	EngineJobBindingV1Schema,
	OccurrenceV1Schema,
	ReferenceSchema,
	TimestampSchema,
} from "../primitives";

const ReviewAreaV1Schema = z.enum(["frontend", "backend"]);
const ReviewGateV1Schema = z.strictObject({
	nodeId: ReferenceSchema,
	reviewArea: ReviewAreaV1Schema,
});

export const ReviewClassificationRequestV1Schema = z
	.strictObject({
		version: z.literal(1),
		executionId: ReferenceSchema,
		publicationId: ReferenceSchema,
		engineJobId: z.uuid(),
		classificationRequestId: z.uuid(),
		diffId: ReferenceSchema,
		reviewedHead: ReferenceSchema,
		gates: z.array(ReviewGateV1Schema).min(1),
	})
	.refine(
		({ gates }) =>
			new Set(gates.map(({ nodeId }) => nodeId)).size === gates.length &&
			gates.every(({ nodeId }, index) => index === 0 || gates[index - 1]!.nodeId < nodeId),
		"Review gates must have unique node identities in node order.",
	);

const canonicalValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]),
		);
	}
	return value;
};

export const canonicalReviewClassificationRequest = (value: ReviewClassificationRequestV1): string =>
	JSON.stringify(canonicalValue(ReviewClassificationRequestV1Schema.parse(value)));

export const ReviewClassificationVisitV1Schema = z.strictObject({
	version: z.literal(1),
	...EngineJobBindingV1Schema.shape,
	...OccurrenceV1Schema.shape,
	requestId: z.uuid(),
	classificationRequestId: z.uuid(),
	classificationRequestDigest: DigestSchema,
	diffId: ReferenceSchema,
	reviewedHead: ReferenceSchema,
	specHash: DigestSchema,
});

export const ReviewWaitV1Schema = z
	.strictObject({
		version: z.literal(1),
		...EngineJobBindingV1Schema.shape,
		occurrence: OccurrenceV1Schema,
		engineRequestId: z.uuid(),
		actionKey: ReferenceSchema,
		reviewArea: ReviewAreaV1Schema,
		visit: ReviewClassificationVisitV1Schema,
		visitDigest: DigestSchema,
		deadlineRefs: z.array(ReferenceSchema),
	})
	.refine(
		({ executionId, publicationId, engineJobId, engineEpoch, occurrence, engineRequestId, visit }) =>
			executionId === visit.executionId &&
			publicationId === visit.publicationId &&
			engineJobId === visit.engineJobId &&
			engineEpoch === visit.engineEpoch &&
			engineRequestId === visit.requestId &&
			occurrence.nodeId === visit.nodeId &&
			occurrence.occurrenceKey === visit.occurrenceKey &&
			occurrence.parentOccurrenceKey === visit.parentOccurrenceKey &&
			occurrence.phase === visit.phase &&
			JSON.stringify(occurrence.iterationPath) === JSON.stringify(visit.iterationPath),
		"The review wait must retain the exact engine visit.",
	);

const reviewResult = {
	version: z.literal(1),
	classificationRequestId: z.uuid(),
	classificationRequestDigest: DigestSchema,
	classificationReceiptId: ReferenceSchema,
};
export const ReviewClassificationResultV1Schema = z.discriminatedUnion("state", [
	z.strictObject({
		...reviewResult,
		state: z.literal("claimed"),
		relevance: z.null(),
		error: z.null(),
	}),
	z.strictObject({
		...reviewResult,
		state: z.literal("succeeded"),
		relevance: z.strictObject({ frontend: z.boolean(), backend: z.boolean() }),
		error: z.null(),
	}),
	z.strictObject({
		...reviewResult,
		state: z.literal("failed"),
		relevance: z.null(),
		error: z.string().min(1),
	}),
]);

export const ReviewClassificationResponseV1Schema = z
	.strictObject({
		version: z.literal(1),
		visit: ReviewClassificationVisitV1Schema,
		visitDigest: DigestSchema,
		result: ReviewClassificationResultV1Schema,
	})
	.refine(
		({ visit, result }) =>
			visit.classificationRequestId === result.classificationRequestId &&
			visit.classificationRequestDigest === result.classificationRequestDigest,
		"The review result must match the saved classification request.",
	);

export const ReviewClassificationDeliveryV1Schema = z
	.strictObject({
		version: z.literal(1),
		wait: ReviewWaitV1Schema,
		result: ReviewClassificationResponseV1Schema.refine(
			({ result }) => result.state !== "claimed",
			"A claimed classification cannot resume a graph.",
		),
		resultDigest: DigestSchema,
		authority: DeliveryAuthorityV1Schema,
	})
	.refine(
		({ wait, result, authority }) =>
			result.visitDigest === wait.visitDigest &&
			result.visit.requestId === wait.engineRequestId &&
			result.visit.executionId === wait.executionId &&
			result.visit.publicationId === wait.publicationId &&
			result.visit.engineJobId === wait.engineJobId &&
			result.visit.engineEpoch === wait.engineEpoch &&
			authority.executionId === wait.executionId &&
			authority.publicationId === wait.publicationId &&
			authority.engineJobId === wait.engineJobId &&
			authority.engineEpoch >= wait.engineEpoch &&
			authority.permissions.includes("classification.deliver"),
		"Classification delivery requires current authority for the exact review wait.",
	);

export const ReviewClassificationAcceptanceV1Schema = z.strictObject({
	version: z.literal(1),
	executionId: ReferenceSchema,
	engineJobId: z.uuid(),
	engineRequestId: z.uuid(),
	classificationReceiptId: ReferenceSchema,
	resultDigest: DigestSchema,
	engineWaitId: ReferenceSchema,
	acceptanceId: ReferenceSchema,
	signalId: z.uuid(),
	enqueueObligationId: z.uuid(),
	acceptedAt: TimestampSchema,
});

export type ReviewClassificationRequestV1 = z.infer<typeof ReviewClassificationRequestV1Schema>;
export type ReviewClassificationVisitV1 = z.infer<typeof ReviewClassificationVisitV1Schema>;
export type ReviewWaitV1 = z.infer<typeof ReviewWaitV1Schema>;
export type ReviewClassificationResultV1 = z.infer<typeof ReviewClassificationResultV1Schema>;
export type ReviewClassificationResponseV1 = z.infer<typeof ReviewClassificationResponseV1Schema>;
export type ReviewClassificationDeliveryV1 = z.infer<typeof ReviewClassificationDeliveryV1Schema>;
export type ReviewClassificationAcceptanceV1 = z.infer<typeof ReviewClassificationAcceptanceV1Schema>;
