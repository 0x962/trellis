import { z } from "zod";
import {
	EpicRefStringSchema,
	LabelRefStringSchema,
	ProjectRefStringSchema,
	StatusRefStringSchema,
	TicketRefStringSchema,
	WaveRefStringSchema,
} from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { AttachmentSchema } from "./attachment.ts";
import {
	CiStateSchema,
	PrioritySchema,
	PrStateSchema,
	ReviewerSchema,
	ReviewStateSchema,
	StatusCategorySchema,
} from "./enums.ts";
import { EpicLinkSchema } from "./epicLink.ts";
import { TicketLabelSchema } from "./label.ts";
import { booleanString, CountSchema, commaList, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";
import { ProjectLinkSchema } from "./project.ts";
import { LinkedPullRequestSchema } from "./pullRequest.ts";
import { ReviewGapSchema } from "./reviewReady.ts";
import { StatusSummarySchema } from "./status.ts";
import { TicketPrSchema } from "./ticketPr.ts";
import { WaveLinkSchema } from "./wave.ts";

// A title is stored trimmed. The limit keeps a row under the summary budget.
export const TicketTitleSchema = z
	.string()
	.trim()
	.min(1, "Enter a title of 1 to 500 characters.")
	.max(500, "Enter a title of 1 to 500 characters.");

export const TicketIdentifierSchema = z.string().regex(/^[A-Z][A-Z0-9]{1,9}-[1-9][0-9]*$/);

const PrReviewSchema = z.object({
	owner: z.string().min(1),
	repo: z.string().min(1),
	number: z.number().int().positive(),
	reviewState: ReviewStateSchema,
	// True while the agent has not asked for review. GitHub accepts no
	// review then, so the mark draws the idle look.
	notReady: z.boolean(),
});

// The PR badge on a row: the pull request and review states that need the
// most work, the check counts behind the ribbon, and the approval state of
// each linked pull request. `reviewGaps` holds what the first linked pull
// request that is not ready for review still needs.
const PrBadgeSchema = z.object({
	state: PrStateSchema,
	isDraft: z.boolean().default(false),
	isQueued: z.boolean(),
	reviewGaps: z.array(ReviewGapSchema),
	ciState: CiStateSchema,
	reviewState: ReviewStateSchema,
	pass: CountSchema,
	fail: CountSchema,
	pending: CountSchema,
	reviews: z.array(PrReviewSchema),
});

const LastActorSchema = ActorRefSchema.extend({
	at: IsoDateTimeSchema,
});

// The row every list, board, and ticket event carries. About
// 300 bytes, and about 80 bytes more for each label; the description lives
// only on `Ticket`. `version` bumps on every row change and is the guard
// `applyEvent` compares before a patch.
export const TicketSummarySchema = z.object({
	id: UlidSchema,
	identifier: TicketIdentifierSchema,
	number: z.number().int().positive(),
	title: TicketTitleSchema,
	priority: PrioritySchema,
	status: StatusSummarySchema,
	project: ProjectLinkSchema,
	parent: z.object({ id: UlidSchema, identifier: TicketIdentifierSchema }).nullable(),
	// Every ticket above this one, the top of the tree first and the parent
	// last. Empty for a ticket with no parent. A board card draws it as the
	// trail that leads to the ticket.
	ancestors: z.array(TicketIdentifierSchema),
	// The epic the ticket belongs to. A ticket belongs to at most one epic.
	epic: EpicLinkSchema.nullable(),
	// The wave the ticket belongs to. It is a wave of `epic`, so a
	// ticket with no epic has no wave.
	wave: WaveLinkSchema.nullable(),
	childCount: CountSchema,
	childDoneCount: CountSchema,
	attachmentCount: CountSchema,
	// The labels with no group first, then by group name, then by label name.
	labels: z.array(TicketLabelSchema),
	waitsOn: z.array(
		z.object({
			identifier: TicketIdentifierSchema,
			title: TicketTitleSchema,
			status: StatusCategorySchema,
		}),
	),
	releases: z.array(
		z.object({
			identifier: TicketIdentifierSchema,
			title: TicketTitleSchema,
		}),
	),
	ready: z.boolean(),
	pr: PrBadgeSchema.nullable(),
	// The pull requests in the order they were linked to the ticket.
	prRows: z.array(TicketPrSchema),
	lastActor: LastActorSchema.nullable(),
	position: z.number(),
	version: z.number().int().positive(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	completedAt: IsoDateTimeSchema.nullable(),
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;

export const TicketContractSchema = z.object({
	result: z.string(),
	files: z.array(z.string()),
	leaveAlone: z.array(z.string()),
	verify: z.array(z.string()),
	reviewFocus: z.array(z.string()),
});
export type TicketContract = z.infer<typeof TicketContractSchema>;
export const ticketContractFields = Object.keys(TicketContractSchema.shape) as (keyof TicketContract)[];

// The `tickets.get` shape: the summary plus what only the ticket page reads.
export const TicketSchema = TicketSummarySchema.extend({
	description: z.string(),
	contract: TicketContractSchema,
	outcome: z.string(),
	children: z.array(TicketSummarySchema),
	prs: z.array(LinkedPullRequestSchema),
	attachments: z.array(AttachmentSchema),
});
// `descriptionStale` lives only in a client cache. The live applier sets it
// on a cached detail when an event names the description, because a
// summary carries no text. A refetch replaces the whole entry, which drops
// the flag. An editor saves only while the flag is absent.
export type Ticket = z.infer<typeof TicketSchema> & { descriptionStale?: boolean };

export const summaryOf = (ticket: Ticket): TicketSummary => TicketSummarySchema.parse(ticket);

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

export const PrFilterSchema = z.enum(["any", "none", "open", "not-ready", "queued", "merged", "closed"]);
export type PrFilter = z.infer<typeof PrFilterSchema>;

// `not-ready` was called `draft` until the review readiness rule landed. A
// saved link, a bookmark and an older CLI still send the old word, so the
// query accepts it and reads it as the new one. Every answer carries
// `not-ready`.
export const PrFilterInputSchema = z.preprocess((value) => (value === "draft" ? "not-ready" : value), PrFilterSchema);

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
	// `label` keeps a ticket that holds one or more of these labels. The value
	// `none` in it keeps a ticket that holds no label. `labelNot` keeps a
	// ticket that holds none of these labels. With `project` set, a ref names a
	// label of that project tree. With no project, a name matches the label of
	// that name in every tree.
	label: commaList(LabelRefStringSchema).optional(),
	labelNot: commaList(LabelRefStringSchema).optional(),
	parent: z.union([z.literal("none"), TicketRefStringSchema]).optional(),
	// `waitsOn` keeps tickets that have a dependency edge to the named ticket.
	waitsOn: TicketRefStringSchema.optional(),
	// `blocked` tests for at least one dependency whose status is still open.
	blocked: booleanString.optional(),
	// `none` keeps the tickets outside every epic.
	epic: z.union([z.literal("none"), EpicRefStringSchema]).optional(),
	// `none` keeps the tickets outside every wave.
	wave: z.union([z.literal("none"), WaveRefStringSchema]).optional(),
	pr: PrFilterInputSchema.optional(),
	ci: commaList(CiStateSchema).optional(),
	actor: ActorFilterSchema.optional(),
	q: z.string().optional(),
	updated: IsoDateTimeSchema.optional(),
	created: IsoDateTimeSchema.optional(),
	completed: IsoDateTimeSchema.optional(),
	sort: SortSchema.default("-updatedAt"),
	cursor: z.string().optional(),
	limit: z.coerce
		.number()
		.int("Enter a whole number for the limit.")
		.min(1, "Enter a limit of 1 to 200.")
		.max(200, "Enter a limit of 1 to 200.")
		.default(50),
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
