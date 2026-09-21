import { z } from "zod";
import { CiStateSchema } from "./enums";
import { booleanString, IsoDateTimeSchema, UlidSchema } from "./primitives";
import { CheckSchema, PullRequestSchema } from "./pullRequest";
import { TicketIdentifierSchema } from "./ticket";
import { TicketPrSchema } from "./ticketPr";

export const ReviewRefSchema = z.string().min(1).max(2048);
export const ReviewBodySchema = z
	.string()
	.trim()
	.min(1, "Enter a review comment of 1 to 200,000 characters.")
	.max(200_000, "Enter a review comment of 1 to 200,000 characters.");
export const ReactionKeySchema = z.enum(["+1", "-1", "laugh", "hooray", "confused", "heart", "rocket", "eyes"]);
export const ReviewReactionSchema = z.object({
	reaction: ReactionKeySchema,
	author: z.string(),
	kind: z.enum(["human", "agent", "system"]),
});
export const ReviewReplySchema = z.object({
	id: z.string(),
	author: z.string(),
	kind: z.enum(["human", "agent", "system", "unknown"]),
	session: z.string().nullable(),
	body: z.string(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	version: z.number().int(),
	reactions: z.array(ReviewReactionSchema),
});
// The suggestion a thread body carries. `original` is the text of the
// anchor lines in the reviewed revision, which the mini diff and the apply
// need. `applied` names the commit that took the suggestion. `outdated`
// means the head no longer holds the original lines at the anchor.
export const ReviewSuggestionSchema = z.object({
	original: z.array(z.string()),
	state: z.enum(["open", "applied", "outdated"]),
	appliedSha: z.string().nullable(),
	appliedAt: IsoDateTimeSchema.nullable(),
});
export type ReviewSuggestion = z.infer<typeof ReviewSuggestionSchema>;
export const ReviewThreadSchema = ReviewReplySchema.extend({
	prId: UlidSchema,
	path: z.string(),
	side: z.enum(["old", "new"]),
	line: z.number().int().positive(),
	startLine: z.number().int().positive(),
	revisionId: UlidSchema.nullable(),
	status: z.enum(["open", "resolved"]),
	resolvedBy: z.string().nullable(),
	resolvedAt: IsoDateTimeSchema.nullable(),
	replies: z.array(ReviewReplySchema),
	// Absent on a thread written before suggestions existed.
	suggestion: ReviewSuggestionSchema.nullable().optional(),
});
export type ReviewThread = z.infer<typeof ReviewThreadSchema>;
export type ReviewReply = z.infer<typeof ReviewReplySchema>;
export const ReviewAnchorSchema = z
	.object({
		path: z.string().min(1).max(4096),
		side: z.enum(["old", "new"]).default("new"),
		line: z.number().int().positive(),
		startLine: z.number().int().positive().optional(),
		revisionId: UlidSchema.nullable().optional(),
		body: ReviewBodySchema,
		// The text of the anchor lines, for a suggestion on lines outside
		// the hunks of the patch. The server reads lines inside a hunk from
		// the patch itself.
		original: z.array(z.string()).max(10_000).optional(),
	})
	.refine((v) => v.startLine === undefined || v.startLine <= v.line, {
		path: ["startLine"],
		message: "The first line must precede the last line.",
	});
export const ReviewCreateSchema = z
	.object({ pr: ReviewRefSchema, ...ReviewAnchorSchema.shape })
	.refine((v) => v.startLine === undefined || v.startLine <= v.line, {
		path: ["startLine"],
		message: "The first line must precede the last line.",
	});
export type ReviewCreate = z.input<typeof ReviewCreateSchema>;
export const ReviewListSchema = z.object({
	pr: ReviewRefSchema,
	all: booleanString.default(false),
	offset: z.coerce.number().int().min(0).default(0),
	limit: z.coerce
		.number()
		.int("Enter a whole number for the limit.")
		.min(1, "Enter a limit of 1 to 500.")
		.max(500, "Enter a limit of 1 to 500.")
		.default(100),
});
export const ReviewPageSchema = z.object({
	items: z.array(ReviewThreadSchema),
	total: z.number().int(),
	open: z.number().int(),
});
export const ReviewPrSchema = z.object({
	id: UlidSchema,
	url: z.string(),
	owner: z.string(),
	repo: z.string(),
	number: z.number().int(),
	title: z.string(),
	state: z.string(),
	isDraft: z.boolean(),
	isQueued: z.boolean(),
	checks: z.array(CheckSchema),
	ciState: CiStateSchema,
	open: z.number().int(),
	resolved: z.number().int(),
	updatedAt: IsoDateTimeSchema,
});
// `gh pr view` supplies the other fields, whose shape belongs to GitHub.
// Keep this schema loose so each GitHub field passes through unchanged.
export const ReviewStatusSchema = z.looseObject({
	isQueued: z.boolean(),
	ticket: z.object({ identifier: TicketIdentifierSchema, title: z.string() }).nullable(),
	prRow: TicketPrSchema.nullable(),
	checks: z.array(CheckSchema).nullable(),
});
export const ReviewRevisionSchema = z.object({
	id: UlidSchema,
	prId: UlidSchema,
	baseSha: z.string(),
	headSha: z.string(),
	patch: z.string(),
	meta: z.record(z.string(), z.unknown()),
	fetchedAt: IsoDateTimeSchema,
});
export type ReviewRevision = z.infer<typeof ReviewRevisionSchema>;
export const ReviewSubmitSchema = z
	.strictObject({
		pr: ReviewRefSchema,
		headSha: z.string().min(1),
		verdict: z.enum(["comment", "approve", "request_changes"]),
		body: z.string().trim().max(200_000).default(""),
		// The local threads that this verdict gives to the agent. A thread can
		// belong to an older revision of the same pull request.
		threadIds: z.array(UlidSchema).max(200).default([]),
	})
	.refine((value) => value.verdict === "approve" || value.body.length > 0, {
		path: ["body"],
		message: "Enter a review summary before you submit this review.",
	});
export type ReviewSubmit = z.output<typeof ReviewSubmitSchema>;
// Each recipient is an open agent assignment with a `review_deliveries` row.
// Its agent process can still be stopped or lost.
export const ReviewSubmitRecipientSchema = z.object({
	runId: UlidSchema,
	agentName: z.string(),
});
export type ReviewSubmitRecipient = z.infer<typeof ReviewSubmitRecipientSchema>;
// A person needs the saved verdict and its recipients after a submit. An
// empty recipient list means no open agent assignment can receive it.
export const ReviewSubmitResultSchema = z.object({
	pullRequest: PullRequestSchema,
	submission: z.object({
		id: UlidSchema,
		recipients: z.array(ReviewSubmitRecipientSchema),
	}),
});
export type ReviewSubmitResult = z.infer<typeof ReviewSubmitResultSchema>;
// One commit on the head branch takes the suggestions of these threads.
export const ReviewApplySchema = z.strictObject({
	pr: ReviewRefSchema,
	threadIds: z.array(UlidSchema).min(1).max(50),
	headSha: z.string().min(1),
	message: z.string().trim().max(10_000).optional(),
});
export type ReviewApply = z.output<typeof ReviewApplySchema>;
export const ReviewApplyResultSchema = z.object({
	sha: z.string(),
	url: z.string(),
	threads: z.array(ReviewThreadSchema),
});
export type ReviewApplyResult = z.infer<typeof ReviewApplyResultSchema>;
// One review submission on its way to one agent run. `reviews.show` reads
// the rows of one submission, so `reviewId` always holds that submission.
export const ReviewDeliverySchema = z.object({
	id: UlidSchema,
	reviewId: UlidSchema,
	runId: UlidSchema,
	state: z.enum(["pending", "sending", "sent", "failed", "unknown"]),
	error: z.string().nullable(),
	readAt: IsoDateTimeSchema.nullable(),
});
export type ReviewDelivery = z.infer<typeof ReviewDeliverySchema>;
export const ReviewSubmissionSchema = z.object({
	id: UlidSchema,
	prId: UlidSchema,
	url: z.string(),
	author: z.string(),
	verdict: z.enum(["commented", "changes_requested", "approved"]),
	body: z.string(),
	revisionId: UlidSchema.nullable(),
	threads: z.array(ReviewThreadSchema),
	createdAt: IsoDateTimeSchema,
	deliveries: z.array(ReviewDeliverySchema),
});
export type ReviewSubmission = z.infer<typeof ReviewSubmissionSchema>;
