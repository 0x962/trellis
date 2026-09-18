import { z } from "zod";
import { HarnessSchema } from "../harness/harness.ts";
import { ModelIdSchema } from "../models/models.ts";
import { StatusCategorySchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const AgentRunKindSchema = z.enum(["agent", "manager", "flow", "session"]);
export type AgentRunKind = z.infer<typeof AgentRunKindSchema>;
export const AgentRunSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	accountId: UlidSchema.nullish(),
	runtime: z.enum(["native", "superset", "tmux", "commands"]),
	harness: HarnessSchema.nullable(),
	kind: AgentRunKindSchema,
	instruction: z.string(),
	projectId: UlidSchema.nullable(),
	projectPath: z.string(),
	ticketId: UlidSchema.nullable(),
	ticketIdentifier: z.string().nullable(),
	ticketTitle: z.string().nullable(),
	ticketStatusCategory: StatusCategorySchema.nullable(),
	assigned: z.boolean(),
	state: z.enum(["starting", "interrupted", "running", "failed", "stopped", "exited"]),
	processStatus: z.enum(["running", "exited", "unknown"]).nullable(),
	observation: z
		.object({
			checkedAt: z.string(),
			controllable: z.boolean(),
			activity: z.object({ state: z.enum(["ready", "working", "idle"]), updatedAt: z.string() }).nullable(),
			outcome: z.enum(["completed", "interrupted", "failed"]).nullable(),
			turnId: z.string().nullable(),
		})
		.nullable(),
	workspaceId: z.string().nullable(),
	terminalId: z.string().nullable(),
	url: z.string().nullable(),
	error: z.string().nullable(),
	// The agent session of the run, which trellis names and the agent
	// command receives. A manager keeps it across every pause, so a start
	// after a pause resumes the same session.
	sessionId: z.string().nullable(),
	// True after a resume in which the agent did not find the session. The
	// manager page then asks the person whether to start a new session.
	sessionLost: z.boolean(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type AgentRun = z.infer<typeof AgentRunSchema>;
export const TicketMetricsSchema = z.object({
	durationMs: z.number().nonnegative().nullable(),
	tokenCount: z.number().int().nonnegative().nullable(),
	ageMs: z.number().nonnegative(),
});
export type TicketMetrics = z.infer<typeof TicketMetricsSchema>;
export const AgentRunStartInputSchema = z
	.strictObject({
		harness: HarnessSchema.optional(),
		model: ModelIdSchema.optional().describe(
			"Canonical model ID from models.list for this assignment. Defaults to the project's harness model.",
		),
		accountId: UlidSchema.optional().describe(
			"Configured harness account. Select an enabled account from harnessAccounts.list.",
		),
		requestId: z
			.string()
			.min(1)
			.max(200)
			.regex(/^[\x21-\x7e]+$/)
			.optional(),
		ticket: z.string().min(1).optional(),
		project: z.string().min(1).optional(),
		// True gives a manager a new session in place of the one its row
		// holds. A person sends it after a resume lost the session.
		newSession: z.boolean().optional(),
	})
	.refine((input) => (input.ticket === undefined) !== (input.project === undefined), "Select one ticket or project.")
	.refine(
		(input) => input.ticket === undefined || input.harness !== undefined,
		"Select a harness for the ticket agent.",
	);
export type AgentRunStartInput = z.infer<typeof AgentRunStartInputSchema>;
export const AgentRunListInputSchema = z.strictObject({
	ticket: z.string().optional(),
	project: z.string().optional(),
	ids: z.array(z.string().min(1)).max(200).optional(),
	assigned: z.boolean().optional(),
});
export type AgentRunListInput = z.infer<typeof AgentRunListInputSchema>;

export const AgentWorkspaceInputSchema = z.object({ runId: UlidSchema });
export const AgentWorkspaceLineStatsInputSchema = z.strictObject({
	ticketIds: z.array(UlidSchema).min(1).max(200),
});
export const AgentWorkspaceLineStatSchema = z.object({
	ticketId: UlidSchema,
	additions: CountSchema,
	deletions: CountSchema,
});
export const AgentWorkspaceFileInputSchema = AgentWorkspaceInputSchema.extend({
	path: z.string().min(1).max(4096),
});
export const AgentWorkspaceSchema = z.object({
	runId: UlidSchema,
	files: z.array(
		z.object({
			path: z.string(),
			status: z.string(),
		}),
	),
	diff: z.string(),
	truncated: z.boolean(),
});
export const AgentWorkspaceFileSchema = z.object({
	path: z.string(),
	text: z.string().nullable(),
	bytes: z.number(),
	truncated: z.boolean(),
	binary: z.boolean(),
});
