import { z } from "zod";
import { ProjectRefStringSchema, StatusRefStringSchema, TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { AttachmentSchema } from "./attachment.ts";
import { CiStateSchema, PrioritySchema, PrStateSchema, ReviewerSchema, StatusCategorySchema } from "./enums.ts";
import { booleanString, CountSchema, commaList, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";
import { ProjectLinkSchema } from "./project.ts";
import { LinkedPullRequestSchema } from "./pullRequest.ts";
import { StatusSummarySchema } from "./status.ts";

// A title is stored trimmed. The limit keeps a row under the summary budget.
const TitleSchema = z.string().trim().min(1).max(500);

const IdentifierSchema = z.string().regex(/^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$/);

// The PR badge on a row: the worst state across the ticket's pull requests
// and the check counts behind the ribbon.
const PrBadgeSchema = z.object({
	state: PrStateSchema,
	ciState: CiStateSchema,
	pass: CountSchema,
	fail: CountSchema,
	pending: CountSchema,
});

const LastActorSchema = ActorRefSchema.extend({
	at: IsoDateTimeSchema,
});

// The row every list, board, inbox section, and ticket event carries. About
// 300 bytes; the description lives only on `Ticket`. `version` bumps on every
// row change and is the guard `applyEvent` compares before a patch.
export const TicketSummarySchema = z.object({
	id: UlidSchema,
	identifier: IdentifierSchema,
	number: z.number().int().positive(),
	title: TitleSchema,
	priority: PrioritySchema,
	status: StatusSummarySchema,
	project: ProjectLinkSchema,
	parent: z.object({ id: UlidSchema, identifier: IdentifierSchema }).nullable(),
	childCount: CountSchema,
	childDoneCount: CountSchema,
	commentCount: CountSchema,
	attachmentCount: CountSchema,
	pr: PrBadgeSchema.nullable(),
	lastActor: LastActorSchema.nullable(),
	position: z.number(),
	version: z.number().int().positive(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	completedAt: IsoDateTimeSchema.nullable(),
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;

// The `tickets.get` shape: the summary plus what only the ticket page reads.
export const TicketSchema = TicketSummarySchema.extend({
	description: z.string(),
	children: z.array(TicketSummarySchema),
	prs: z.array(LinkedPullRequestSchema),
	attachments: z.array(AttachmentSchema),
});
// `descriptionStale` lives only in a client cache. The live applier sets it
// on a cached detail when an event names the description, because a
// summary carries no text. A refetch replaces the whole entry, which drops
// the flag. An editor saves only while the flag is absent.
export type Ticket = z.infer<typeof TicketSchema> & { descriptionStale?: boolean };

export const SortSchema = z.enum([
	"updatedAt",
	"-updatedAt",
	"createdAt",
	"-createdAt",
	"priority",
	"-priority",
	"number",
	"-number",
	"status",
	"-status",
	"position",
	"-position",
]);
export type Sort = z.infer<typeof SortSchema>;

export const PrFilterSchema = z.enum(["any", "none", "open", "draft", "merged", "closed"]);
export type PrFilter = z.infer<typeof PrFilterSchema>;

// The last actor filter: `kind:name` or a bare `name`.
const ActorFilterSchema = z.string().regex(/^(?:(?:human|agent):)?[\x20-\x39\x3B-\x7E]{1,64}$/);

// The list grammar shared by the API query string, the web URL, and the CLI
// flags. Every list field takes an array or one comma-separated string.
// Timestamps are "after" bounds.
export const ListQuerySchema = z.strictObject({
	project: ProjectRefStringSchema.optional(),
	subprojects: booleanString.default(true),
	status: commaList(StatusRefStringSchema).optional(),
	category: commaList(StatusCategorySchema).optional(),
	reviewer: ReviewerSchema.optional(),
	priority: commaList(PrioritySchema).optional(),
	parent: z.union([z.literal("none"), TicketRefStringSchema]).optional(),
	pr: PrFilterSchema.optional(),
	ci: commaList(CiStateSchema).optional(),
	actor: ActorFilterSchema.optional(),
	q: z.string().optional(),
	updated: IsoDateTimeSchema.optional(),
	created: IsoDateTimeSchema.optional(),
	completed: IsoDateTimeSchema.optional(),
	sort: SortSchema.default("-updatedAt"),
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;
export type ListQueryInput = z.input<typeof ListQuerySchema>;

// A page carries no total; `tickets.counts` answers that with one query.
export const ListOutputSchema = z.object({
	items: z.array(TicketSummarySchema),
	nextCursor: z.string().nullable(),
});
export type ListOutput = z.infer<typeof ListOutputSchema>;

// The board and the counts take the list filters without paging or order.
export const BoardQuerySchema = ListQuerySchema.omit({ sort: true, cursor: true, limit: true });
export type BoardQueryInput = z.input<typeof BoardQuerySchema>;

export const CountsQuerySchema = BoardQuerySchema;
export type CountsQueryInput = z.input<typeof CountsQuerySchema>;

// One column per effective status. `items` holds the first 100 cards by
// (position, id); `count` is the whole column.
export const BoardColumnSchema = z.object({
	statusId: UlidSchema,
	count: CountSchema,
	items: z.array(TicketSummarySchema),
});
export type BoardColumn = z.infer<typeof BoardColumnSchema>;

export const BoardOutputSchema = z.object({
	columns: z.array(BoardColumnSchema),
});
export type BoardOutput = z.infer<typeof BoardOutputSchema>;

export const CountsOutputSchema = z.object({
	total: CountSchema,
	byStatus: z.array(z.object({ statusId: UlidSchema, count: CountSchema })),
});
export type CountsOutput = z.infer<typeof CountsOutputSchema>;

export const TicketGetInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
});

// `status` defaults to the project's default status; `description` to the
// project's ticket template.
export const TicketCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	title: TitleSchema,
	description: z.string().optional(),
	priority: PrioritySchema.optional(),
	status: StatusRefStringSchema.optional(),
	parent: TicketRefStringSchema.optional(),
	force: z.boolean().optional(),
});
export type TicketCreateInput = z.input<typeof TicketCreateInputSchema>;

// `expectedVersion` makes the write conditional: a mismatch is
// VERSION_CONFLICT with the current row. `parent: null` clears the parent.
export const TicketUpdateInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	title: TitleSchema.optional(),
	description: z.string().optional(),
	priority: PrioritySchema.optional(),
	status: StatusRefStringSchema.optional(),
	parent: TicketRefStringSchema.nullable().optional(),
	project: ProjectRefStringSchema.optional(),
	expectedVersion: z.number().int().positive().optional(),
});
export type TicketUpdateInput = z.input<typeof TicketUpdateInputSchema>;

// `after` and `before` must sit in the target column. `force` lets an agent
// move a ticket to a done status.
export const TicketMoveInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	status: StatusRefStringSchema,
	after: TicketRefStringSchema.optional(),
	before: TicketRefStringSchema.optional(),
	force: z.boolean().optional(),
	expectedVersion: z.number().int().positive().optional(),
});
export type TicketMoveInput = z.input<typeof TicketMoveInputSchema>;

// A batch is one transaction of at most 200 tickets.
const TicketBatchSchema = z.array(TicketRefStringSchema).min(1).max(200);

export const TicketUpdateManyInputSchema = z.strictObject({
	tickets: TicketBatchSchema,
	status: StatusRefStringSchema.optional(),
	priority: PrioritySchema.optional(),
	project: ProjectRefStringSchema.optional(),
	parent: TicketRefStringSchema.nullable().optional(),
	force: z.boolean().optional(),
});
export type TicketUpdateManyInput = z.input<typeof TicketUpdateManyInputSchema>;

export const TicketUpdateManyOutputSchema = z.object({
	items: z.array(TicketSummarySchema),
});

export const TicketDeleteManyInputSchema = z.strictObject({
	tickets: TicketBatchSchema,
	force: z.boolean().optional(),
});
export type TicketDeleteManyInput = z.input<typeof TicketDeleteManyInputSchema>;

export const TicketDeleteManyOutputSchema = z.object({
	deleted: z.array(IdentifierSchema),
});

export const TicketDeleteInputSchema = z.strictObject({
	ticket: TicketRefStringSchema,
	force: booleanString.optional(),
});
export type TicketDeleteInput = z.input<typeof TicketDeleteInputSchema>;

export const TicketDeleteOutputSchema = z.object({
	deleted: IdentifierSchema,
});
