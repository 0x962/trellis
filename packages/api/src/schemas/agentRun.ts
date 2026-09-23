import { z } from "zod";
import { HarnessSchema } from "../harness/harness.ts";
import { ModelIdSchema } from "../models/models.ts";
import { StatusCategorySchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";
import { SessionAttentionSchema } from "./sessionActivity.ts";

export const AgentRunKindSchema = z.enum(["agent", "flow", "session"]);
export type AgentRunKind = z.infer<typeof AgentRunKindSchema>;
export const AgentRunSchema = z.object({
	id: UlidSchema,
	seenAttention: z.object({ attemptId: z.string().nullable(), sequence: z.number().int().nonnegative() }).optional(),
	name: z.string(),
	accountId: UlidSchema.nullish(),
	switchedTo: z.string().nullish(),
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
	ticketEpicId: UlidSchema.nullable().default(null),
	ticketEpicProjectId: UlidSchema.nullable().default(null),
	assigned: z.boolean(),
	state: z.enum(["starting", "interrupted", "running", "failed", "stopped", "exited"]),
	processStatus: z.enum(["running", "exited", "unknown"]).nullable(),
	observation: z
		.object({
			checkedAt: z.string(),
			attention: SessionAttentionSchema.optional(),
			controllable: z.boolean(),
			activity: z.object({ state: z.enum(["ready", "working", "idle"]), updatedAt: z.string() }).nullable(),
			lastMessage: z.object({ text: z.string(), at: z.string() }).nullable(),
			lastTool: z
				.object({
					name: z.string(),
					// The one short line that says what the tool works on: the file
					// path of an edit, the command of a shell call, the address of a
					// fetch. It is null when the tool input names none of these.
					target: z.string().nullable(),
					targetKind: z.enum(["text", "code"]).nullable(),
					status: z.enum(["running", "completed", "failed"]),
					startedAt: z.string().nullable(),
					updatedAt: z.string(),
				})
				.nullable(),
			outcome: z.enum(["completed", "interrupted", "failed"]).nullable(),
			turnId: z.string().nullable(),
		})
		.nullable(),
	workspaceId: z.string().nullable(),
	terminalId: z.string().nullable(),
	url: z.string().nullable(),
	error: z.string().nullable(),
	// The agent session of the run, which trellis names and the agent command receives.
	sessionId: z.string().nullable(),
	// True after a resume in which the agent did not find the session.
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
		model: ModelIdSchema.optional().describe("Canonical model ID from models.list for this assignment."),
		accountId: UlidSchema.optional().describe("Configured harness account from harnessAccounts.list."),
		requestId: z
			.string()
			.min(1)
			.max(200)
			.regex(/^[\x21-\x7e]+$/)
			.optional(),
		ticket: z.string().min(1),
	})
	.refine((input) => input.harness !== undefined, "Select a harness for the ticket agent.");
export type AgentRunStartInput = z.infer<typeof AgentRunStartInputSchema>;
export const AgentRunRetryInputSchema = z.strictObject({
	id: UlidSchema,
	expectedTerminalId: z.string().min(1),
	requestId: z.string().min(1).max(200),
});
export type AgentRunRetryInput = z.infer<typeof AgentRunRetryInputSchema>;
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
// The Git state of the workspace of one run. `directory` comes from the
// run row, so it is present in every state. `missing` means the directory
// is not on disk. `unreadable` means Git could not read it, and `error`
// holds the text Git printed. In the `ready` state `branch` is null when
// HEAD names no branch, and `head` is the short commit id. `base` is the
// branch that the workspace started from. It is null when the workspace
// started from a commit that no branch named, and for a scratch session
// repository. `ahead` and `behind` count commits against that start. The
// line and file counts include the files that are not committed, and
// `uncommitted` counts the files that differ from HEAD.
const workspaceSummaryFields = { runId: UlidSchema, directory: z.string() };
export const AgentWorkspaceSummarySchema = z.discriminatedUnion("state", [
	z.object({
		...workspaceSummaryFields,
		state: z.literal("ready"),
		branch: z.string().nullable(),
		head: z.string(),
		base: z.string().nullable(),
		ahead: CountSchema,
		behind: CountSchema,
		files: CountSchema,
		additions: CountSchema,
		deletions: CountSchema,
		uncommitted: CountSchema,
	}),
	z.object({ ...workspaceSummaryFields, state: z.literal("missing") }),
	z.object({ ...workspaceSummaryFields, state: z.literal("unreadable"), error: z.string() }),
]);
export type AgentWorkspaceSummary = z.infer<typeof AgentWorkspaceSummarySchema>;
export type ReadyWorkspaceSummary = Extract<AgentWorkspaceSummary, { state: "ready" }>;
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
