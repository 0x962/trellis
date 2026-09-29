import { z } from "zod";
import {
	FlowDigestV1Schema,
	FlowDocumentSnapshotV1Schema,
	FlowEngineV1Schema,
	FlowPublicationV1Schema,
	FlowRevisionV1Schema,
} from "./flowDocumentV1.ts";
import { FlowExecutionSchema, FlowExecutionStateSchema, FlowStepStateSchema } from "./flowExecution.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

const opaqueId = z.string().min(1);
const commit = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const FlowOccurrenceIdentityV1Schema = z.strictObject({
	nodeId: opaqueId,
	occurrenceKey: opaqueId,
	parentOccurrenceKey: opaqueId.nullable(),
	phase: z.enum(["step", "children", "condition"]),
	iterationPath: z.array(z.strictObject({ loopNodeId: opaqueId, round: z.number().int().min(1).max(50) })),
});
export type FlowOccurrenceIdentityV1 = z.infer<typeof FlowOccurrenceIdentityV1Schema>;

export const FlowAttemptV1Schema = z.strictObject({
	stepId: opaqueId,
	agentRunId: UlidSchema,
	attemptId: opaqueId,
	workspaceId: opaqueId.nullable(),
	workspaceCommit: commit.nullable().describe("Null means that Trellis has no observed workspace commit."),
	providerSessionId: opaqueId.nullable(),
	state: z.enum(["reserved", "launched", "exited", "unknown"]),
	launchedAt: IsoDateTimeSchema.nullable(),
	resultId: opaqueId.nullable(),
});
export type FlowAttemptV1 = z.infer<typeof FlowAttemptV1Schema>;

export const FlowDeadlineV1Schema = z
	.strictObject({
		deadlineId: opaqueId,
		groupOccurrenceKey: opaqueId,
		launchedAt: IsoDateTimeSchema.nullable(),
		deadlineAt: IsoDateTimeSchema.nullable(),
	})
	.refine(
		(value) => (value.launchedAt === null) === (value.deadlineAt === null),
		"A group deadline starts with its first observed launch.",
	);

export type FlowDeadlineV1 = z.infer<typeof FlowDeadlineV1Schema>;

const stop = {
	stepId: opaqueId,
	agentRunId: UlidSchema,
	attemptId: opaqueId,
	reason: z.string().min(1),
	requestedAt: IsoDateTimeSchema,
};
export const FlowStopObligationV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ ...stop, state: z.enum(["pending", "ownership_unknown"]), confirmedAt: z.null() }),
	z.strictObject({ ...stop, state: z.literal("confirmed"), confirmedAt: IsoDateTimeSchema }),
]);
export type FlowStopObligationV1 = z.infer<typeof FlowStopObligationV1Schema>;

const decision = {
	decisionId: opaqueId,
	payloadDigest: FlowDigestV1Schema,
	engineRequestId: opaqueId,
	actionKey: opaqueId,
	occurrenceKey: opaqueId,
	actor: z.strictObject({ kind: z.literal("human"), name: z.string().min(1) }),
	approved: z.boolean(),
	output: z.string(),
	expectedRevision: FlowRevisionV1Schema,
	recordedAt: IsoDateTimeSchema,
};
export const FlowDecisionDeliveryV1Schema = z.discriminatedUnion("state", [
	z.strictObject({
		...decision,
		state: z.enum(["recorded", "pending", "unknown"]),
		acceptedReceiptId: z.null(),
		confirmedAt: z.null(),
	}),
	z.strictObject({
		...decision,
		state: z.literal("confirmed"),
		acceptedReceiptId: opaqueId,
		confirmedAt: IsoDateTimeSchema,
	}),
]);
export type FlowDecisionDeliveryV1 = z.infer<typeof FlowDecisionDeliveryV1Schema>;

export const FlowOccurrenceV1Schema = FlowOccurrenceIdentityV1Schema.extend({
	title: z.string(),
	instruction: z.string(),
	actionKey: opaqueId,
	state: FlowStepStateSchema,
	waitReason: z.enum(["human", "native", "ownership_unknown", "admission"]).nullable(),
	output: z.string().nullable(),
	decision: z.enum(["yes", "no"]).nullable(),
	error: z.string().nullable(),
	skipReason: z.string().nullable(),
	startedAt: IsoDateTimeSchema.nullable(),
	endedAt: IsoDateTimeSchema.nullable(),
	deadlineRefs: z.array(opaqueId),
	attempts: z.array(FlowAttemptV1Schema),
});
export type FlowOccurrenceV1 = z.infer<typeof FlowOccurrenceV1Schema>;

export const FlowSubmissionV1Schema = z
	.strictObject({
		requestId: z.uuid(),
		state: z.enum(["reserved", "submitted", "submission_unknown", "failed"]),
		admission: z.enum(["closed", "open"]),
		engineJobId: opaqueId.nullable(),
		engineEpoch: z.number().int().positive(),
		ownership: z.enum(["confirmed", "unknown"]),
		error: z.string().nullable(),
	})
	.refine(
		(value) => value.state !== "submitted" || value.engineJobId !== null,
		"A submitted execution must identify its engine job.",
	)
	.refine(
		(value) => value.admission !== "open" || (value.state === "submitted" && value.ownership === "confirmed"),
		"Open admission requires a confirmed owner and a submitted execution.",
	);
export type FlowSubmissionV1 = z.infer<typeof FlowSubmissionV1Schema>;

export const FlowExecutionViewV1Schema = FlowExecutionSchema.omit({
	doc: true,
	state: true,
	tasks: true,
	headSha: true,
})
	.strict()
	.extend({
		schemaVersion: z.literal(1),
		engine: FlowEngineV1Schema,
		reviewedHead: commit
			.nullable()
			.describe("The caller names this review target. It does not identify a workspace checkout."),
		snapshot: FlowDocumentSnapshotV1Schema,
		publication: FlowPublicationV1Schema.nullable(),
		submission: FlowSubmissionV1Schema.nullable(),
		status: FlowExecutionStateSchema.shape.status,
		detail: z.enum([
			"queued",
			"active",
			"waiting_human",
			"waiting_native",
			"unknown",
			"completed",
			"failed",
			"canceled",
		]),
		failureKind: z.enum(["error", "feedback"]).nullable(),
		error: z.string().nullable(),
		lastEventSeq: z.number().int().nonnegative(),
		occurrences: z.array(FlowOccurrenceV1Schema),
		deadlines: z.array(FlowDeadlineV1Schema),
		stopObligations: z.array(FlowStopObligationV1Schema),
		decisionDeliveries: z.array(FlowDecisionDeliveryV1Schema),
	})
	.refine(
		(value) => value.engine === value.snapshot.engine && value.flowId === value.snapshot.flow.id,
		"The immutable snapshot must belong to this flow and engine.",
	)
	.refine(
		(value) =>
			value.engine === "legacy"
				? value.publication === null && value.submission === null
				: value.publication !== null &&
					value.submission !== null &&
					value.publication.flowId === value.flowId &&
					value.publication.revision === value.snapshot.revision &&
					value.publication.documentHash === value.snapshot.documentHash &&
					value.publication.componentManifestHash === value.snapshot.componentManifestHash,
		"A Langflow execution requires the publication of its immutable snapshot.",
	);
export type FlowExecutionViewV1 = z.infer<typeof FlowExecutionViewV1Schema>;
