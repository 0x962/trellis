import { z } from "zod";
import { AgentRunSchema } from "./agentRun.ts";
import { UlidSchema } from "./primitives.ts";

export const AgentActivitySchema = z.object({
	run: AgentRunSchema,
	sessionId: UlidSchema.nullable(),
});
export type AgentActivity = z.infer<typeof AgentActivitySchema>;
