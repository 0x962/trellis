import { z } from "zod";
import { ProjectRefStringSchema } from "../../refs.ts";
import { UlidSchema } from "../primitives.ts";
import { PullRequestSchema } from "../pullRequest.ts";

export const AgentRunPullRequestsInputSchema = z.strictObject({
	ids: z.array(UlidSchema).max(200),
	project: ProjectRefStringSchema.optional(),
});
export type AgentRunPullRequestsInput = z.infer<typeof AgentRunPullRequestsInputSchema>;

export const AgentRunPullRequestSchema = z.object({ runId: UlidSchema, pullRequest: PullRequestSchema });
export type AgentRunPullRequest = z.infer<typeof AgentRunPullRequestSchema>;
