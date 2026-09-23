import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { ProjectColorSchema } from "./enums.ts";
import { booleanString, CountSchema, IsoDateTimeSchema, KeySchema, SlugSchema, UlidSchema } from "./primitives.ts";
import { StatusSchema } from "./status.ts";

const ProjectNameSchema = z
	.string()
	.min(1, "Enter a project name of 1 to 120 characters.")
	.max(120, "Enter a project name of 1 to 120 characters.");

// The project fields a ticket row carries. `key` is the canonical project
// ref and the prefix of every ticket identifier of the project.
export const ProjectLinkSchema = z.object({
	id: UlidSchema,
	key: KeySchema,
});
export type ProjectLink = z.infer<typeof ProjectLinkSchema>;

// One row of the project list. `position` gives the display order.
// `openEpicCount` counts the epics of this project whose state is open.
// `color` is the color a person gave this project. It tints the mark of the
// project and the ground of every page of the project. A project with `null`
// keeps the grey mark and the plain ground.
export const ProjectSummarySchema = ProjectLinkSchema.extend({
	slug: SlugSchema,
	name: ProjectNameSchema,
	position: z.number().int(),
	openCount: CountSchema,
	openEpicCount: CountSchema,
	color: ProjectColorSchema.nullable(),
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

const ProjectDirectorySchema = z
	.string()
	.trim()
	.refine((value) => value === "" || value.startsWith("/"), "Use an absolute directory path.");

export const ProjectSchema = ProjectSummarySchema.extend({
	directory: ProjectDirectorySchema,
	description: z.string(),
	ticketTemplate: z.string(),
	ticketCounter: CountSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	repos: z.array(RepoSchema),
	statuses: z.array(StatusSchema),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectListInputSchema = z.strictObject({
	archived: booleanString.optional(),
});
export type ProjectListInput = z.input<typeof ProjectListInputSchema>;

export const ProjectGetInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
});

// Every project owns a key and the ticket counter that numbers its tickets.
export const ProjectCreateInputSchema = z.strictObject({
	directory: ProjectDirectorySchema.optional(),
	key: KeySchema,
	name: ProjectNameSchema,
	description: z.string().optional(),
	ticketTemplate: z.string().optional(),
	// `null` gives the project no color, as it does on an update.
	color: ProjectColorSchema.nullable().optional(),
});
export type ProjectCreateInput = z.input<typeof ProjectCreateInputSchema>;

// A new `key` lands only while the ticket counter is zero, because the key
// is the prefix of every ticket identifier the project handed out.
export const ProjectUpdateInputSchema = z.strictObject({
	directory: ProjectDirectorySchema.optional(),
	project: ProjectRefStringSchema,
	key: KeySchema.optional(),
	name: ProjectNameSchema.optional(),
	description: z.string().optional(),
	ticketTemplate: z.string().optional(),
	// `null` frees the color slot of the project for another project.
	color: ProjectColorSchema.nullable().optional(),
	archived: z.boolean().optional(),
});
export type ProjectUpdateInput = z.input<typeof ProjectUpdateInputSchema>;

// Reorders the project in the list, before or after another project.
export const ProjectMoveInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
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
