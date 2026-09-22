import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	ResourceCommentAnchorsInputSchema,
	ResourceCommentCreateInputSchema,
	ResourceCommentEditInputSchema,
	ResourceCommentIdInputSchema,
	ResourceCommentListInputSchema,
	ResourceCommentRemoveOutputSchema,
	ResourceCommentReplyInputSchema,
	ResourceCommentResolveInputSchema,
	ResourceCommentThreadSchema,
} from "../schemas/resourceComment.ts";
import { base } from "./base.ts";

// Comment threads on the text of a document resource. Every list holds the
// resolved threads too, oldest thread first.
export const resourceComments = {
	list: base
		.route({ method: "GET", path: "/resources/{resource}/comments", summary: "List the comment threads of a document" })
		.input(ResourceCommentListInputSchema)
		.output(z.array(ResourceCommentThreadSchema)),
	create: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/resources/{resource}/comments",
			successStatus: 201,
			summary: "Comment on the text of a document",
		})
		.input(ResourceCommentCreateInputSchema)
		.output(ResourceCommentThreadSchema),
	anchors: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({
			method: "PUT",
			path: "/resources/{resource}/comment-anchors",
			summary: "Store the anchors that an edit of a document moved",
		})
		.input(ResourceCommentAnchorsInputSchema)
		.output(z.array(ResourceCommentThreadSchema)),
	reply: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/resource-comments/{thread}/replies", summary: "Reply to a document comment" })
		.input(ResourceCommentReplyInputSchema)
		.output(ResourceCommentThreadSchema),
	resolve: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/resource-comments/{thread}/resolve",
			summary: "Resolve or reopen a document comment thread",
		})
		.input(ResourceCommentResolveInputSchema)
		.output(ResourceCommentThreadSchema),
	edit: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "PATCH", path: "/resource-comments/{id}", summary: "Edit your own document comment" })
		.input(ResourceCommentEditInputSchema)
		.output(ResourceCommentThreadSchema),
	remove: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({
			method: "DELETE",
			path: "/resource-comments/{id}",
			summary: "Delete your own document comment; the first comment deletes its thread",
		})
		.input(ResourceCommentIdInputSchema)
		.output(ResourceCommentRemoveOutputSchema),
};
