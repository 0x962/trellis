import { z } from "zod";
import { HarnessSchema } from "../harness/harness.ts";
import { AgentRunSchema } from "./agentRun.ts";
import { booleanString, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// The name a person gave the session, or the generated name of a session
// nobody named. Two sessions may hold one name.
export const SessionNameSchema = z.string().trim().min(1, "Enter a name.").max(60);

// The run owns the conversation, process attempts, and workspace.
export const SessionSchema = z.object({
	id: UlidSchema,
	name: SessionNameSchema,
	projectId: UlidSchema.nullable(),
	projectKey: z.string(),
	directory: z.string(),
	harness: HarnessSchema,
	runId: UlidSchema,
	archivedAt: IsoDateTimeSchema.nullable(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;

// A session with the observed state of its agent run.
export const SessionDetailSchema = SessionSchema.extend({ run: AgentRunSchema });
export type SessionDetail = z.infer<typeof SessionDetailSchema>;

// `archived` keeps only archived or only active sessions. Without it every
// session is listed, which is what the sidebar asks for: one read fills the
// Sessions section and the Archived section.
export const SessionListInputSchema = z.strictObject({
	archived: booleanString.optional().describe("True lists only archived sessions, false only active ones."),
});
export type SessionListInput = z.input<typeof SessionListInputSchema>;

export const SessionCreateInputSchema = z
	.strictObject({
		project: z.string().min(1).optional(),
		requestId: z.string().uuid().optional(),
		files: z.array(z.file()).max(20).optional(),
		name: SessionNameSchema.optional().describe(
			"The session name, stored as it is typed. Omit it for a generated name.",
		),
		prompt: z.string().trim().max(20000).describe("The initial prompt sent to the agent."),
		harness: HarnessSchema.optional().describe("The agent program, model, and effort. Sessions default to Claude."),
		accountId: UlidSchema.optional().describe("Configured harness account from harnessAccounts.list."),
	})
	.refine((input) => input.prompt.length > 0 || (input.files?.length ?? 0) > 0, "Enter a prompt or attach a file.");
export type SessionCreateInput = z.infer<typeof SessionCreateInputSchema>;

export const SessionRefSchema = z.string().trim().min(1);

export const SessionIdInputSchema = z.strictObject({ id: SessionRefSchema });
export type SessionIdInput = z.infer<typeof SessionIdInputSchema>;

export const SessionMoveInputSchema = z
	.strictObject({
		id: SessionRefSchema,
		project: z.string().min(1).nullable(),
	})
	.describe("Set the project of a session, or send null to make it independent.");
export type SessionMoveInput = z.infer<typeof SessionMoveInputSchema>;

export const SessionArchiveInputSchema = z
	.strictObject({
		id: SessionRefSchema,
		archived: z.boolean(),
	})
	.describe("Put a session away, or bring it back. An archived session runs no agent and joins no project.");
export type SessionArchiveInput = z.infer<typeof SessionArchiveInputSchema>;

export const SessionRenameInputSchema = z
	.strictObject({
		id: SessionRefSchema,
		name: SessionNameSchema,
	})
	.describe("Rename a session.");
export type SessionRenameInput = z.infer<typeof SessionRenameInputSchema>;
