import { z } from "zod";
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

// An absolute folder path with no trailing slash and no empty segment. A
// trusted folder is a real directory on the machine that runs the agents,
// so the grammar takes the POSIX form the runner reports.
export const folderPathPattern = /^\/[^/\0]+(\/[^/\0]+)*$/;

export const FolderPathSchema = z
	.string()
	.max(1000)
	.regex(folderPathPattern, "Expected an absolute folder path without a trailing slash.");

// One folder trellis may mark as trusted for the agents of a project. A
// folder inside one of these roots inherits the trust, so a ticket's
// worktree under a trusted repo root needs no row of its own.
export const TrustedFolderSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	path: FolderPathSchema,
});
export type TrustedFolder = z.infer<typeof TrustedFolderSchema>;

const AncestorSchema = ProjectLinkSchema.extend({
	slug: SlugSchema,
	name: ProjectNameSchema,
});

// `statuses` is the effective set: the project's own, or the nearest
// ancestor's, named by `statusesInheritedFrom`.
export const ProjectSchema = ProjectSummarySchema.extend({
	description: z.string(),
	ticketTemplate: z.string(),
	ticketCounter: CountSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	ancestors: z.array(AncestorSchema),
	children: z.array(ProjectSummarySchema),
	repos: z.array(RepoSchema),
	trustedFolders: z.array(TrustedFolderSchema),
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

// A full replace, like `projects.setRepos`. The rows of the ancestors stay
// as they are: the effective roots of a project are its own rows and its
// ancestors' rows together.
export const ProjectSetTrustedFoldersInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	paths: z.array(FolderPathSchema),
});
export type ProjectSetTrustedFoldersInput = z.input<typeof ProjectSetTrustedFoldersInputSchema>;
