import { z } from "zod";

export const FailureV1Schema = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.literal("error"),
		reason: z.enum(["worker_lost", "native_launch_failed", "process_error", "timeout", "invalid_execution"]),
	}),
	z.strictObject({ kind: z.literal("feedback"), reason: z.enum(["human_rejected", "loop_exhausted"]) }),
]);
export const ProtocolConflictV1Schema = z.strictObject({
	version: z.literal(1),
	code: z.enum([
		"identity_conflict",
		"admission_closed",
		"authority_expired",
		"stale_owner",
		"ownership_unknown",
		"receipt_mismatch",
		"stale_action",
	]),
});
export type FailureV1 = z.infer<typeof FailureV1Schema>;
export type ProtocolConflictV1 = z.infer<typeof ProtocolConflictV1Schema>;
