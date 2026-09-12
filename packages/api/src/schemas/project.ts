import { z } from "zod";
import { AgentCommandSchema } from "../agentCommand/agentCommand.ts";
import {
	DEFAULT_AGENT_RESUME_COMMAND,
	DEFAULT_AGENT_START_COMMAND,
	unknownLaunchVariables,
} from "../agentLaunch/agentLaunch.ts";
import { HarnessCommandsSchema } from "../harnessCommands/harnessCommands.ts";
import { ProjectRefStringSchema } from "../refs.ts";
import { booleanString, CountSchema, IsoDateTimeSchema, KeySchema, SlugSchema, UlidSchema } from "./primitives.ts";
import { StatusSchema } from "./status.ts";

const ProjectNameSchema = z.string().min(1).max(120);

// The project fields a ticket row carries. `path` is the canonical project
// ref, `CDE.web.auth`.
export const ProjectLinkSchema = z.object({
	id: UlidSchema,
	key: KeySchema,
	path: z.string().min(1),
});
export type ProjectLink = z.infer<typeof ProjectLinkSchema>;

// One row of the flat project list. The client builds the tree from
// `parentId`, and `depth` and `position` give the display order.
export const ProjectSummarySchema = ProjectLinkSchema.extend({
	parentId: UlidSchema.nullable(),
	rootId: UlidSchema,
	slug: SlugSchema,
	name: ProjectNameSchema,
	depth: CountSchema,
	position: z.number().int(),
	openCount: CountSchema,
	needsYouCount: CountSchema,
	archivedAt: IsoDateTimeSchema.nullable(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const RepoSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	owner: z.string().min(1),
	repo: z.string().min(1),
});
export type Repo = z.infer<typeof RepoSchema>;

const AncestorSchema = ProjectLinkSchema.extend({
	slug: SlugSchema,
	name: ProjectNameSchema,
});

// `statuses` is the effective set: the project's own, or the nearest
// ancestor's, named by `statusesInheritedFrom`.
export const AdeSchema = z.enum(["superset", "custom"]);
export type Ade = z.infer<typeof AdeSchema>;

export const ProjectManagerConfigSchema = z.strictObject({
	personaId: UlidSchema.nullable(),
	concurrency: z.number().int().min(1).max(64),
	directory: z
		.string()
		.trim()
		.refine((value) => value === "" || value.startsWith("/"), "Use an absolute directory path."),
	// False stops every new agent of the project. An agent that already runs
	// keeps running. A project row written before this field existed holds no
	// value, so the default turns agents on.
	enabled: z.boolean().default(true),
	// The Superset machine that runs the project's agents, by its machine id.
	// Null runs them on the machine that runs the trellis server.
	supersetHostId: z.string().min(1).nullable().default(null),
	// The Agentic Development Environment that runs this project's agents.
	// "superset" opens a Superset workspace. "custom" runs adeCommand.
	ade: AdeSchema.default("superset"),
	// The command that starts one agent, for a project whose ADE is custom.
	// Empty means the machine's own launch command, which starts Superset.
	adeCommand: z.string().trim().default(""),
	// The command that opens an agent again in the workspace its run has,
	// for a project whose ADE is custom. Empty runs adeCommand again.
	adeResumeCommand: z
		.string()
		.trim()
		.refine((value) => unknownLaunchVariables(value).length === 0, "The command has an unknown template variable.")
		.default(""),
	agentCommand: z
		.union([AgentCommandSchema, z.literal("").transform(() => DEFAULT_AGENT_START_COMMAND)])
		.default(DEFAULT_AGENT_START_COMMAND),
	agentResumeCommand: z
		.union([AgentCommandSchema, z.literal("").transform(() => DEFAULT_AGENT_RESUME_COMMAND)])
		.default(DEFAULT_AGENT_RESUME_COMMAND),
	harnessCommands: HarnessCommandsSchema.nullable().default(null),
});
export type ProjectManagerConfig = z.infer<typeof ProjectManagerConfigSchema>;
export const DEFAULT_PROJECT_MANAGER_CONFIG: ProjectManagerConfig = {
	personaId: null,
	concurrency: 3,
	directory: "",
	enabled: true,
	supersetHostId: null,
	ade: "superset",
	adeCommand: "",
	adeResumeCommand: "",
	agentCommand: DEFAULT_AGENT_START_COMMAND,
	agentResumeCommand: DEFAULT_AGENT_RESUME_COMMAND,
	harnessCommands: null,
};

export const ProjectSchema = ProjectSummarySchema.extend({
	managerConfig: ProjectManagerConfigSchema.optional(),
	description: z.string(),
	ticketTemplate: z.string(),
	ticketCounter: CountSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	ancestors: z.array(AncestorSchema),
	children: z.array(ProjectSummarySchema),
	repos: z.array(RepoSchema),
	statuses: z.array(StatusSchema),
	statusesInheritedFrom: UlidSchema.nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectListInputSchema = z.strictObject({
	archived: booleanString.optional(),
});
export type ProjectListInput = z.input<typeof ProjectListInputSchema>;

export const ProjectGetInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

// A root owns a key and the ticket counter. A child takes its root's key and
// is addressed by slug, so exactly one of `key` and `parent` is present.
export const ProjectCreateInputSchema = z
	.strictObject({
		key: KeySchema.optional(),
		parent: ProjectRefStringSchema.optional(),
		name: ProjectNameSchema,
		slug: SlugSchema.optional(),
		description: z.string().optional(),
		ticketTemplate: z.string().optional(),
	})
	.refine(
		(input) => (input.parent === undefined) !== (input.key === undefined),
		"A root project needs a key; a sub-project takes its parent and no key.",
	);
export type ProjectCreateInput = z.input<typeof ProjectCreateInputSchema>;

// `key` applies to a root and only while its ticket counter is zero; `slug`
// applies to a sub-project, whose slug is its path segment.
export const ProjectUpdateInputSchema = z.strictObject({
	managerConfig: ProjectManagerConfigSchema.optional(),
	project: ProjectRefStringSchema,
	key: KeySchema.optional(),
	name: ProjectNameSchema.optional(),
	slug: SlugSchema.optional(),
	description: z.string().optional(),
	ticketTemplate: z.string().optional(),
	archived: z.boolean().optional(),
});
export type ProjectUpdateInput = z.input<typeof ProjectUpdateInputSchema>;

// `parent: null` moves the project to the top level of its root. A project
// never leaves its root.
export const ProjectMoveInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	parent: ProjectRefStringSchema.nullable().optional(),
	after: ProjectRefStringSchema.optional(),
	before: ProjectRefStringSchema.optional(),
});
export type ProjectMoveInput = z.input<typeof ProjectMoveInputSchema>;

export const ProjectDeleteInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	force: booleanString.optional(),
});

export const ProjectDeleteOutputSchema = z.object({
	deleted: z.string().min(1),
});

const RepoInputSchema = z.strictObject({
	owner: z.string().min(1),
	repo: z.string().min(1),
});

export const ProjectSetReposInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	repos: z.array(RepoInputSchema),
});
export type ProjectSetReposInput = z.input<typeof ProjectSetReposInputSchema>;
