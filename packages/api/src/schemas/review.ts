import { z } from "zod";
import { booleanString, IsoDateTimeSchema, UlidSchema } from "./primitives";

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
	open: z.number().int(),
	resolved: z.number().int(),
	updatedAt: IsoDateTimeSchema,
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
export const ReviewSubmitSchema = z.object({
	pr: ReviewRefSchema,
	requestId: z.string().min(1).max(128),
	verdict: z.enum(["commented", "changes_requested", "approved"]),
	body: z.string().max(200_000).default(""),
	revisionId: UlidSchema.nullable().optional(),
	threadIds: z.array(z.string()).max(500).default([]),
	drafts: z.array(ReviewAnchorSchema).max(100).default([]),
	recipients: z.array(UlidSchema).max(20),
});
export type ReviewSubmit = z.output<typeof ReviewSubmitSchema>;
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
