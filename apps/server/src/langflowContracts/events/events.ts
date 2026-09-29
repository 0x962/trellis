import { z } from "zod";
import { FailureV1Schema } from "../failures";
import {
	BindingV1Schema,
	DigestSchema,
	OccurrenceV1Schema,
	ReferenceSchema,
	RevisionSchema,
	TimestampSchema,
} from "../primitives";

const ExecutionPayloadV1Schema = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.enum(["execution_started", "execution_succeeded", "execution_canceled"]),
		receiptId: ReferenceSchema,
	}),
	z.strictObject({ kind: z.literal("execution_failed"), failure: FailureV1Schema, receiptId: ReferenceSchema }),
]);
const OccurrencePayloadV1Schema = z.discriminatedUnion("kind", [
	z.strictObject({ kind: z.literal("step_queued"), stepId: ReferenceSchema }),
	z.strictObject({
		kind: z.literal("step_started"),
		stepId: ReferenceSchema,
		attemptId: z.uuid(),
		launchReceiptId: ReferenceSchema,
	}),
	z.strictObject({
		kind: z.literal("step_result"),
		stepId: ReferenceSchema,
		completionId: ReferenceSchema,
		outputHash: DigestSchema,
	}),
	z.strictObject({ kind: z.literal("step_skipped"), reason: z.enum(["unselected_branch", "parent_skipped"]) }),
	z.strictObject({
		kind: z.literal("step_unknown"),
		stepId: ReferenceSchema,
		reason: z.enum(["attempt_unknown", "receipt_mismatch", "ownership_unknown"]),
	}),
	z.strictObject({ kind: z.literal("human_requested"), engineRequestId: ReferenceSchema, actionKey: ReferenceSchema }),
	z.strictObject({
		kind: z.literal("human_receipt"),
		decisionId: ReferenceSchema,
		delivery: z.enum(["recorded", "pending", "confirmed", "unknown"]),
	}),
	z.strictObject({
		kind: z.literal("stop_status"),
		obligationId: ReferenceSchema,
		state: z.enum(["pending", "confirmed", "ownership_unknown"]),
	}),
]);
const source = {
	version: z.literal(1),
	...BindingV1Schema.shape,
	sourceEventId: ReferenceSchema,
	occurredAt: TimestampSchema,
};
export const SourceEventV1Schema = z.union([
	z.strictObject({ ...source, occurrence: z.null(), payload: ExecutionPayloadV1Schema }),
	z.strictObject({ ...source, occurrence: OccurrenceV1Schema, payload: OccurrencePayloadV1Schema }),
]);
export const ExecutionEventV1Schema = z
	.strictObject({
		...source,
		seq: RevisionSchema,
		sourceDigest: DigestSchema,
		occurrence: OccurrenceV1Schema.nullable(),
		payload: z.union([ExecutionPayloadV1Schema, OccurrencePayloadV1Schema]),
	})
	.refine(
		(value) =>
			SourceEventV1Schema.safeParse({
				version: value.version,
				executionId: value.executionId,
				publicationId: value.publicationId,
				engineJobId: value.engineJobId,
				engineEpoch: value.engineEpoch,
				sourceEventId: value.sourceEventId,
				occurredAt: value.occurredAt,
				occurrence: value.occurrence,
				payload: value.payload,
			}).success,
		"Step events require an occurrence; execution events require null.",
	);
export const EventReplayRequestV1Schema = z.strictObject({
	version: z.literal(1),
	executionId: ReferenceSchema,
	afterSeq: z.int().nonnegative(),
	limit: z.int().min(1).max(1000),
});
export const EventReplayV1Schema = z
	.discriminatedUnion("state", [
		z.strictObject({
			version: z.literal(1),
			state: z.literal("events"),
			executionId: ReferenceSchema,
			afterSeq: z.int().nonnegative(),
			nextSeq: z.int().nonnegative(),
			events: z.array(ExecutionEventV1Schema),
			hasMore: z.boolean(),
		}),
		z.strictObject({
			version: z.literal(1),
			state: z.literal("gap"),
			executionId: ReferenceSchema,
			afterSeq: z.int().nonnegative(),
			firstAvailableSeq: RevisionSchema,
			snapshotRevision: RevisionSchema,
			snapshotLastSeq: z.int().nonnegative(),
		}),
	])
	.superRefine((value, ctx) => {
		if (value.state !== "events") return;
		const last = value.events.at(-1)?.seq ?? value.afterSeq;
		if (
			last !== value.nextSeq ||
			value.events.some(
				(event, index) => event.executionId !== value.executionId || event.seq !== value.afterSeq + index + 1,
			)
		)
			ctx.addIssue({ code: "custom", message: "Replay requires contiguous events for one execution." });
	});
export type ExecutionEventV1 = z.infer<typeof ExecutionEventV1Schema>;
export type SourceEventV1 = z.infer<typeof SourceEventV1Schema>;
export type EventReplayRequestV1 = z.infer<typeof EventReplayRequestV1Schema>;
export type EventReplayV1 = z.infer<typeof EventReplayV1Schema>;
