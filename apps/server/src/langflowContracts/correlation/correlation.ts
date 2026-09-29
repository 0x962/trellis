import { z } from "zod";
import { BindingV1Schema, DigestSchema, ReferenceSchema, RevisionSchema, TimestampSchema } from "../primitives";

export const CorrelationKeyV1Schema = z.strictObject({
	version: z.literal(1),
	hostId: ReferenceSchema,
	executionId: ReferenceSchema,
});
export const CorrelationReceiptV1Schema = z.strictObject({
	...CorrelationKeyV1Schema.shape,
	publicationId: ReferenceSchema,
	submissionDigest: DigestSchema,
	engineJobId: z.uuid(),
	engineSessionId: ReferenceSchema,
	recordedAt: TimestampSchema,
});
export const CorrelationLookupV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("found"), receipt: CorrelationReceiptV1Schema }),
	z.strictObject({ state: z.literal("absent"), key: CorrelationKeyV1Schema, authoritative: z.literal(true) }),
	z.strictObject({ state: z.literal("unknown"), key: CorrelationKeyV1Schema }),
]);
export const AdmissionReceiptV1Schema = z.strictObject({
	version: z.literal(1),
	...BindingV1Schema.shape,
	admissionId: ReferenceSchema,
	submissionDigest: DigestSchema,
	committedAt: TimestampSchema,
});
export const AdmissionStateV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("closed"), barrierId: ReferenceSchema }),
	z.strictObject({ state: z.literal("open"), receipt: AdmissionReceiptV1Schema }),
]);
export const SubmissionV1Schema = z
	.strictObject({
		version: z.literal(1),
		hostId: ReferenceSchema,
		executionId: ReferenceSchema,
		publicationId: ReferenceSchema,
		requestId: z.uuid(),
		actor: z.strictObject({ kind: z.enum(["human", "agent"]), name: z.string().min(1) }),
		requestDigest: DigestSchema,
		submissionDigest: DigestSchema,
		state: z.enum(["reserved", "submitted", "submission_unknown", "failed"]),
		correlation: CorrelationReceiptV1Schema.nullable(),
		admission: AdmissionStateV1Schema,
		revision: RevisionSchema,
	})
	.superRefine((value, ctx) => {
		const correlation = value.correlation;
		if (
			correlation &&
			["hostId", "executionId", "publicationId", "submissionDigest"].some((key) => {
				const field = key as "hostId" | "executionId" | "publicationId" | "submissionDigest";
				return value[field] !== correlation[field];
			})
		)
			ctx.addIssue({ code: "custom", message: "Correlation must match the submission." });
		if (value.admission.state === "open") {
			const receipt = value.admission.receipt;
			if (
				!correlation ||
				receipt.executionId !== value.executionId ||
				receipt.publicationId !== value.publicationId ||
				receipt.submissionDigest !== value.submissionDigest ||
				receipt.engineJobId !== correlation.engineJobId
			)
				ctx.addIssue({ code: "custom", message: "Open admission requires the committed job association." });
		}
	});
export type CorrelationReceiptV1 = z.infer<typeof CorrelationReceiptV1Schema>;
export type AdmissionReceiptV1 = z.infer<typeof AdmissionReceiptV1Schema>;
export type SubmissionV1 = z.infer<typeof SubmissionV1Schema>;
export type CorrelationKeyV1 = z.infer<typeof CorrelationKeyV1Schema>;
export type CorrelationLookupV1 = z.infer<typeof CorrelationLookupV1Schema>;
export type AdmissionStateV1 = z.infer<typeof AdmissionStateV1Schema>;
