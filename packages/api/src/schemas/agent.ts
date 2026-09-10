import { z } from "zod";
import { ProjectRefStringSchema, TicketRefStringSchema } from "../refs.ts";
import { ActivitySchema } from "./activity.ts";
import { CommentSchema } from "./comment.ts";
import { AgentBlockedReasonSchema, AgentRoleSchema, AgentRunnerSchema, AgentStateSchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";
import { TicketSummarySchema } from "./ticket.ts";

// A runner id (a Superset project, workspace, or terminal) is opaque to
// trellis. The server stores it and gives it back to the runner unchanged.
const RunnerIdSchema = z.string().min(1).max(200);

// Why one agent cannot do its work, and what a human does about it.
// `path` is the folder to trust when the reason is `folder-trust`, and
// null for every other reason. `detail` is what the runner printed.
export const AgentBlockedSchema = z.object({
	reason: AgentBlockedReasonSchema,
	path: z.string().min(1).max(1000).nullable(),
	detail: z.string().min(1).max(2000).nullable(),
	at: IsoDateTimeSchema,
});
export type AgentBlocked = z.infer<typeof AgentBlockedSchema>;

// One agent that the runner started or that reported itself through
// `agents.register`. `ticketId` is null for the manager. `workspaceId`,
// `terminalId`, and `openUrl` are null until the runner reports them.
// `openUrl` is the deep link that opens the workspace in Superset. `title`
// is the tab name, for example "CDE-42 review".
export const AgentSessionSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	ticketId: UlidSchema.nullable(),
	role: AgentRoleSchema,
	runner: AgentRunnerSchema,
	state: AgentStateSchema,
	workspaceId: RunnerIdSchema.nullable(),
	terminalId: RunnerIdSchema.nullable(),
	title: z.string().min(1).max(120),
	openUrl: z.string().min(1).nullable(),
	blocked: AgentBlockedSchema.nullable(),
	lastWokenAt: IsoDateTimeSchema.nullable(),
	createdAt: IsoDateTimeSchema,
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

export const AgentSessionsInputSchema = z
	.strictObject({
		project: ProjectRefStringSchema.optional(),
		ticket: TicketRefStringSchema.optional(),
	})
	.refine(
		(input) => (input.project === undefined) !== (input.ticket === undefined),
		"Pass exactly one of project and ticket.",
	);
export type AgentSessionsInput = z.input<typeof AgentSessionsInputSchema>;

export const AgentSessionsOutputSchema = z.object({
	sessions: z.array(AgentSessionSchema),
});

// The runner resumes an exited agent from `claudeSessionId`. A manager
// serves the whole project and names no ticket; a builder or a reviewer
// names the one ticket it works.
export const AgentRegisterInputSchema = z
	.strictObject({
		role: AgentRoleSchema,
		project: ProjectRefStringSchema,
		ticket: TicketRefStringSchema.optional(),
		workspaceId: RunnerIdSchema,
		terminalId: RunnerIdSchema,
		claudeSessionId: z.string().min(1).max(200),
	})
	.refine(
		(input) => (input.role === "manager") === (input.ticket === undefined),
		"A manager names no ticket; a builder or a reviewer names one.",
	);
export type AgentRegisterInput = z.input<typeof AgentRegisterInputSchema>;

// Each project has one stored cursor: the id of the last activity row its
// manager read.
export const AgentInboxInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	limit: z.number().int().min(1).max(500).default(200),
});
export type AgentInboxInput = z.input<typeof AgentInboxInputSchema>;

// `events` are the activity rows after the cursor, oldest first. `tickets`
// holds one summary per ticket those rows name, and `comments` the bodies
// of the comments they name. `cursor` is the id of the last row returned,
// which is the stored cursor after the call. `more` is true when unread
// rows remain past `limit`.
export const AgentInboxOutputSchema = z.object({
	events: z.array(ActivitySchema),
	tickets: z.array(TicketSummarySchema),
	comments: z.array(CommentSchema),
	cursor: CountSchema,
	more: z.boolean(),
});
export type AgentInboxOutput = z.infer<typeof AgentInboxOutputSchema>;

export const AgentStartBuilderInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
});
export type AgentStartBuilderInput = z.input<typeof AgentStartBuilderInputSchema>;

// The server checks `prUrl` with the pull request URL grammar and answers
// INVALID_PR_URL, as `pullRequests.link` does.
export const AgentStartReviewerInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	prUrl: z.string().min(1),
});
export type AgentStartReviewerInput = z.input<typeof AgentStartReviewerInputSchema>;

export const AgentStopInputSchema = z.strictObject({
	id: UlidSchema,
});

// The one action a blocked agent offers. trellis adds the agent's recorded
// folder to the trusted folders of its project and starts the agent again.
export const AgentUnblockInputSchema = z.strictObject({
	id: UlidSchema,
});
export type AgentUnblockInput = z.input<typeof AgentUnblockInputSchema>;

// The runner types `text` into the manager's terminal and presses Enter.
export const AgentWakeInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	text: z.string().min(1).max(2000),
});
export type AgentWakeInput = z.input<typeof AgentWakeInputSchema>;

// `supersetProjectId` null lets the server match the project's declared
// repo to a Superset project. `maxConcurrent` caps the builders that run at
// one time in the project. `removeWorkspaceOnDone` removes the builder's
// workspace when its ticket is done; the branch stays either way.
export const AgentProjectSettingsSchema = z.object({
	projectId: UlidSchema,
	enabled: z.boolean(),
	supersetProjectId: RunnerIdSchema.nullable(),
	baseBranch: z.string().min(1).max(255),
	maxConcurrent: z.number().int().min(1).max(20).default(3),
	removeWorkspaceOnDone: z.boolean().default(true),
});
export type AgentProjectSettings = z.infer<typeof AgentProjectSettingsSchema>;

// One project the runner knows: for Superset, one row of
// `superset projects list`. `repo` is null for a project with no remote.
export const RunnerProjectSchema = z.object({
	id: RunnerIdSchema,
	name: z.string().min(1),
	repo: z.string().min(1).nullable(),
	path: z.string().min(1),
});
export type RunnerProject = z.infer<typeof RunnerProjectSchema>;

// `matches` has one entry for each trellis project whose declared repo
// matches a runner project. The runner uses that project while the
// project's `supersetProjectId` is null.
export const AgentRunnerProjectsOutputSchema = z.object({
	projects: z.array(RunnerProjectSchema),
	matches: z.array(z.object({ projectId: UlidSchema, runnerProjectId: RunnerIdSchema })),
});
export type AgentRunnerProjectsOutput = z.infer<typeof AgentRunnerProjectsOutputSchema>;

// A project has one manager, so it has at most one settings row.
const oneRowPerProject = (projects: Array<{ projectId: string }>) =>
	new Set(projects.map((project) => project.projectId)).size === projects.length;
const oneRowMessage = "A project appears at most once.";

// `enabled` is the global switch. When it is off, no manager is woken and
// no builder starts; running builders continue.
export const AgentSettingsSchema = z.object({
	runner: AgentRunnerSchema,
	enabled: z.boolean(),
	projects: z.array(AgentProjectSettingsSchema).refine(oneRowPerProject, oneRowMessage),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

// A full replace, like `settings.set`.
export const AgentSettingsSetInputSchema = z.strictObject({
	runner: AgentRunnerSchema,
	enabled: z.boolean(),
	projects: z.array(z.strictObject(AgentProjectSettingsSchema.shape)).refine(oneRowPerProject, oneRowMessage),
});
export type AgentSettingsSetInput = z.input<typeof AgentSettingsSetInputSchema>;
