import { z } from "zod";
import { UlidSchema } from "./primitives.ts";

export const FlowRecoveryV1Schema = z.discriminatedUnion("state", [
	z.strictObject({ state: z.literal("unavailable"), generation: z.null() }),
	z.strictObject({ state: z.enum(["open", "blocked"]), generation: z.number().int().positive() }),
]);
export type FlowRecoveryV1 = z.infer<typeof FlowRecoveryV1Schema>;

export const FlowAttemptOutputV1InputSchema = z.strictObject({
	executionId: UlidSchema,
	stepId: z.string().min(1),
	agentRunId: UlidSchema,
	attemptId: z.string().min(1),
	resultId: z.string().min(1),
});
export type FlowAttemptOutputV1Input = z.infer<typeof FlowAttemptOutputV1InputSchema>;
export const FlowAttemptOutputV1Schema = FlowAttemptOutputV1InputSchema.extend({ output: z.string().nullable() });
export type FlowAttemptOutputV1 = z.infer<typeof FlowAttemptOutputV1Schema>;
