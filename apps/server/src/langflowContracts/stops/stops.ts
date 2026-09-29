import { z } from "zod";
import { ReferenceSchema, RevisionSchema, TimestampSchema } from "../primitives";

const stop = {
	version: z.literal(1),
	obligationId: ReferenceSchema,
	executionId: ReferenceSchema,
	stepId: ReferenceSchema,
	agentRunId: ReferenceSchema,
	attemptId: z.uuid(),
	reason: z.enum(["canceled", "deadline", "engine_failure", "native_failure"]),
	requestedAt: TimestampSchema,
	revision: RevisionSchema,
};
export const StopObligationV1Schema = z
	.discriminatedUnion("state", [
		z.strictObject({ ...stop, state: z.enum(["pending", "ownership_unknown"]), exitReceipt: z.null() }),
		z.strictObject({
			...stop,
			state: z.literal("confirmed"),
			exitReceipt: z.strictObject({
				attemptId: z.uuid(),
				receiptId: ReferenceSchema,
				exitedAt: TimestampSchema,
				confirmedAt: TimestampSchema,
			}),
		}),
	])
	.refine(
		(value) => value.state !== "confirmed" || value.exitReceipt.attemptId === value.attemptId,
		"A stop requires exit proof for the exact attempt.",
	);
export const CancelIntentV1Schema = z.strictObject({
	version: z.literal(1),
	executionId: ReferenceSchema,
	requestId: z.uuid(),
	actor: z.strictObject({ kind: z.literal("human"), name: z.string().min(1) }),
	expectedRevision: RevisionSchema,
	requestedAt: TimestampSchema,
});
export type StopObligationV1 = z.infer<typeof StopObligationV1Schema>;
export type CancelIntentV1 = z.infer<typeof CancelIntentV1Schema>;
