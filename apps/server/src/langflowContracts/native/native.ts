import { z } from "zod";
import { AdmissionReceiptV1Schema } from "../correlation";
import { GroupDeadlineV1Schema } from "../deadlines";
import {
	DigestSchema,
	EngineJobBindingV1Schema,
	OccurrenceV1Schema,
	ReferenceSchema,
	RevisionSchema,
	TimestampSchema,
} from "../primitives";

export const NativeRequestV1Schema = z
	.strictObject({
		version: z.literal(1),
		...EngineJobBindingV1Schema.shape,
		...OccurrenceV1Schema.shape,
		admissionReceipt: AdmissionReceiptV1Schema,
		requestId: z.uuid(),
		specHash: DigestSchema,
		inputReceiptIds: z.array(ReferenceSchema),
		groupDeadlineRefs: z.array(ReferenceSchema),
		deadlineAt: TimestampSchema.nullable(),
	})
	.refine(
		(value) =>
			value.executionId === value.admissionReceipt.executionId &&
			value.publicationId === value.admissionReceipt.publicationId &&
			value.engineJobId === value.admissionReceipt.engineJobId &&
			value.engineEpoch === value.admissionReceipt.engineEpoch,
		"Native admission must match the launch binding.",
	);
export const NativeHandleV1Schema = z.strictObject({
	version: z.literal(1),
	stepId: ReferenceSchema,
	agentRunId: ReferenceSchema,
	attemptId: z.uuid(),
	workspaceId: ReferenceSchema.nullable(),
	providerSessionId: ReferenceSchema.nullable(),
	state: z.enum(["reserved", "launching", "running", "waiting_native", "unknown", "succeeded", "failed", "canceled"]),
	revision: RevisionSchema,
});
export const NativeLaunchProvenanceV1Schema = z.strictObject({
	version: z.literal(1),
	request: NativeRequestV1Schema,
	requestDigest: DigestSchema,
	stepId: ReferenceSchema,
	agentRunId: ReferenceSchema,
	attemptId: z.uuid(),
	reservedAt: TimestampSchema,
});
export const NativeLaunchReceiptV1Schema = z.strictObject({
	version: z.literal(1),
	launchReceiptId: ReferenceSchema,
	stepId: ReferenceSchema,
	attemptId: z.uuid(),
	launchedAt: TimestampSchema,
	recordedAt: TimestampSchema,
	groupDeadlines: z.array(GroupDeadlineV1Schema),
});
export type NativeRequestV1 = z.infer<typeof NativeRequestV1Schema>;
export type NativeHandleV1 = z.infer<typeof NativeHandleV1Schema>;
export type NativeLaunchProvenanceV1 = z.infer<typeof NativeLaunchProvenanceV1Schema>;
export type NativeLaunchReceiptV1 = z.infer<typeof NativeLaunchReceiptV1Schema>;
