import { z } from "zod";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// The longest context that an anchor keeps on each side of the quote.
export const RESOURCE_COMMENT_CONTEXT_MAX = 32;

export const ResourceCommentBodySchema = z
	.string()
	.trim()
	.min(1, "Enter a comment.")
	.max(10000, "Enter a comment of 10000 characters or less.");

// The commented text of a document, with the text just before it and just
// after it. The editor finds the quote in the document by these three
// strings, so the anchor needs no position. A quote that spans two blocks
// holds a newline between them.
export const ResourceCommentAnchorSchema = z.strictObject({
	quote: z.string().min(1).max(2000),
	prefix: z.string().max(RESOURCE_COMMENT_CONTEXT_MAX),
	suffix: z.string().max(RESOURCE_COMMENT_CONTEXT_MAX),
});
export type ResourceCommentAnchor = z.infer<typeof ResourceCommentAnchorSchema>;

export const ResourceCommentSchema = z.object({
	id: UlidSchema,
	body: z.string(),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type ResourceComment = z.infer<typeof ResourceCommentSchema>;

// `id` is the id of the first comment. `textRemoved` is true when an edit
// deleted the whole commented text; the anchor keeps the text it held.
export const ResourceCommentThreadSchema = z.object({
	id: UlidSchema,
	resourceId: UlidSchema,
	anchor: ResourceCommentAnchorSchema,
	textRemoved: z.boolean(),
	resolved: z.object({ actor: ActorRefSchema, at: IsoDateTimeSchema }).nullable(),
	comments: z.array(ResourceCommentSchema).min(1),
});
export type ResourceCommentThread = z.infer<typeof ResourceCommentThreadSchema>;

export const ResourceCommentListInputSchema = z.strictObject({
	resource: UlidSchema,
});

export const ResourceCommentCreateInputSchema = z.strictObject({
	resource: UlidSchema,
	anchor: ResourceCommentAnchorSchema,
	body: ResourceCommentBodySchema,
});

// The anchors of the threads that an edit of the document moved. A thread of
// the resource that the list leaves out keeps its anchor.
export const ResourceCommentAnchorsInputSchema = z.strictObject({
	resource: UlidSchema,
	anchors: z
		.array(z.strictObject({ thread: UlidSchema, anchor: ResourceCommentAnchorSchema, textRemoved: z.boolean() }))
		.max(500),
});

export const ResourceCommentReplyInputSchema = z.strictObject({
	thread: UlidSchema,
	body: ResourceCommentBodySchema,
});

export const ResourceCommentResolveInputSchema = z.strictObject({
	thread: UlidSchema,
	resolved: z.boolean(),
});

export const ResourceCommentEditInputSchema = z.strictObject({
	id: UlidSchema,
	body: ResourceCommentBodySchema,
});

export const ResourceCommentIdInputSchema = z.strictObject({
	id: UlidSchema,
});

export const ResourceCommentRemoveOutputSchema = z.object({
	deleted: UlidSchema,
});
