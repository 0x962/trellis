import { z } from "zod";
import { ProjectRefStringSchema } from "../../refs.ts";
import { IsoDateTimeSchema, UlidSchema } from "../primitives.ts";

export const AgentSubagentsInputSchema = z.strictObject({
	runs: z.array(z.strictObject({ id: UlidSchema, after: z.string().max(1024).optional() })).max(20),
	project: ProjectRefStringSchema.optional(),
});
export type AgentSubagentsInput = z.infer<typeof AgentSubagentsInputSchema>;

const identity = z.object({ parentRunId: UlidSchema, attemptId: z.string(), observedAt: IsoDateTimeSchema });
export const AgentSubagentObservationSchema = z.discriminatedUnion("kind", [
	identity.extend({
		kind: z.literal("spawn"),
		toolCallId: z.string(),
		provider: z.enum(["codex", "claude"]),
		prompt: z.string().nullable(),
		providerChildIds: z.array(z.string()),
		state: z.string(),
		output: z.string().nullable(),
	}),
	identity.extend({
		kind: z.literal("status"),
		providerChildId: z.string(),
		state: z.string(),
		output: z.string().nullable(),
	}),
]);
export type AgentSubagentObservation = z.infer<typeof AgentSubagentObservationSchema>;

export const AgentSubagentPageSchema = z.object({
	runId: UlidSchema,
	observations: z.array(AgentSubagentObservationSchema),
	nextCursor: z.string().nullable(),
	hasMore: z.boolean(),
	issues: z.array(
		z.object({
			attemptId: z.string(),
			reason: z.enum(["unavailable", "invalid-record", "oversized-record", "truncated", "incomplete-record"]),
		}),
	),
});
export type AgentSubagentPage = z.infer<typeof AgentSubagentPageSchema>;
