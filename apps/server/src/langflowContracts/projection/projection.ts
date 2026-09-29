import { z } from "zod";
import { FailureV1Schema } from "../failures";
import { DigestSchema, EngineJobBindingV1Schema, TimestampSchema } from "../primitives";
import { protocolDigest } from "../protocolBytes";
import { EngineCheckpointV1Schema } from "../waits";

const JobStatusSchema = z.enum([
	"queued",
	"in_progress",
	"suspended",
	"completed",
	"failed",
	"cancelled",
	"timed_out",
]);

export const EngineProjectionOutcomeV1Schema = z
	.strictObject({
		version: z.literal(1),
		...EngineJobBindingV1Schema.shape,
		status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
		failure: FailureV1Schema.nullable(),
	})
	.refine(
		(value) => (value.status === "failed") === (value.failure !== null),
		"A failed outcome requires its failure classification.",
	);

const parseBytes = <T>(schema: z.ZodType<T>, bytes: string): T | null => {
	try {
		const parsed = schema.safeParse(JSON.parse(bytes));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

const sameBinding = (
	left: z.infer<typeof EngineJobBindingV1Schema>,
	right: z.infer<typeof EngineJobBindingV1Schema>,
) =>
	left.executionId === right.executionId &&
	left.publicationId === right.publicationId &&
	left.engineJobId === right.engineJobId &&
	left.engineEpoch === right.engineEpoch;

const outcomeStatus = (status: z.infer<typeof JobStatusSchema>) => {
	if (status === "completed") return "succeeded";
	if (status === "failed" || status === "timed_out") return "failed";
	if (status === "cancelled") return "canceled";
	return null;
};

export const EngineProjectionSnapshotV1Schema = z
	.strictObject({
		version: z.literal(1),
		...EngineJobBindingV1Schema.shape,
		sourceCursor: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		capturedAt: TimestampSchema,
		checkpointBytes: z.string().min(1),
		graphCheckpointBytes: z.string().min(1),
		occurrenceJournalBytes: z.string().nullable(),
		jobStatus: JobStatusSchema,
		jobOutcomeBytes: z.string().min(1).nullable(),
	})
	.superRefine((snapshot, ctx) => {
		const checkpoint = parseBytes(EngineCheckpointV1Schema, snapshot.checkpointBytes);
		if (!checkpoint || !sameBinding(snapshot, checkpoint)) {
			ctx.addIssue({ code: "custom", message: "The checkpoint must retain the snapshot binding." });
		}
		const expectedOutcomeStatus = outcomeStatus(snapshot.jobStatus);
		if (expectedOutcomeStatus === null) {
			if (snapshot.jobOutcomeBytes !== null) {
				ctx.addIssue({ code: "custom", message: "A nonterminal snapshot cannot include a terminal outcome." });
			}
			return;
		}
		if (snapshot.jobOutcomeBytes === null) {
			ctx.addIssue({ code: "custom", message: "A terminal snapshot requires an explicit outcome." });
			return;
		}
		const outcome = parseBytes(EngineProjectionOutcomeV1Schema, snapshot.jobOutcomeBytes);
		if (!outcome || !sameBinding(snapshot, outcome) || outcome.status !== expectedOutcomeStatus) {
			ctx.addIssue({ code: "custom", message: "The outcome must retain the terminal snapshot binding and state." });
		}
	});

export const EngineProjectionSnapshotRecordV1Schema = z
	.strictObject({
		version: z.literal(1),
		sourceCursor: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		snapshotBytes: z.string().min(1),
		snapshotDigest: DigestSchema,
	})
	.refine(
		(record) => {
			const snapshot = parseBytes(EngineProjectionSnapshotV1Schema, record.snapshotBytes);
			return (
				snapshot !== null &&
				snapshot.sourceCursor === record.sourceCursor &&
				protocolDigest(record.snapshotBytes) === record.snapshotDigest
			);
		},
		"The record must retain the exact snapshot bytes, cursor, and digest.",
	);

export type EngineProjectionOutcomeV1 = z.infer<typeof EngineProjectionOutcomeV1Schema>;
export type EngineProjectionSnapshotV1 = z.infer<typeof EngineProjectionSnapshotV1Schema>;
export type EngineProjectionSnapshotRecordV1 = z.infer<typeof EngineProjectionSnapshotRecordV1Schema>;
