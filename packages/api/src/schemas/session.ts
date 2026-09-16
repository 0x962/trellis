import { z } from "zod";
import { HarnessSchema } from "../harness/harness.ts";
import { AgentRunSchema } from "./agentRun.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// The name of a session is the name of its directory under `sessions/` in
// the data home: lowercase letters, digits, and dashes, 1 to 40 characters,
// with no dash at either end.
export const SessionNameSchema = z
	.string()
	.regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/, "Use lowercase letters, digits, and dashes, 1 to 40 characters.");

// A session: a scratch git repository with one agent, outside every project
// and ticket. `runId` names the agent run that holds its terminal. `harness`
// is the launch configuration of that agent.
export const SessionSchema = z.object({
	id: UlidSchema,
	name: SessionNameSchema,
	directory: z.string(),
	harness: HarnessSchema,
	runId: UlidSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;

// A session with the observed state of its agent run.
export const SessionDetailSchema = SessionSchema.extend({ run: AgentRunSchema });
export type SessionDetail = z.infer<typeof SessionDetailSchema>;

export const SessionCreateInputSchema = z.strictObject({
	name: z
		.string()
		.trim()
		.min(1)
		.max(60)
		.optional()
		.describe(
			"The session name. The server lowercases it and keeps letters, digits, and dashes. Omit it for a generated name.",
		),
	prompt: z.string().trim().min(1).max(20000).describe("The first message the agent receives."),
	harness: HarnessSchema.optional().describe("The agent program and model. Defaults to Claude with its default model."),
	accountId: UlidSchema.optional().describe(
		"Configured harness account. Select an enabled account from harnessAccounts.list.",
	),
});
export type SessionCreateInput = z.infer<typeof SessionCreateInputSchema>;

export const SessionIdInputSchema = z.strictObject({ id: UlidSchema });
export type SessionIdInput = z.infer<typeof SessionIdInputSchema>;
