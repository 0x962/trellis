import { pickErrors } from "../errors.ts";
import {
	CommentCreateInputSchema,
	CommentDeleteOutputSchema,
	CommentIdInputSchema,
	CommentResolveInputSchema,
	CommentSchema,
	CommentThreadSchema,
	CommentUpdateInputSchema,
} from "../schemas/comment.ts";
import { base } from "./base.ts";

const archived = pickErrors(["PROJECT_ARCHIVED"]);

export const comments = {
	thread: base
		.route({ method: "GET", path: "/comments/{id}/thread", summary: "Read a comment thread" })
		.input(CommentIdInputSchema)
		.output(CommentThreadSchema),
	resolve: base
		.errors(archived)
		.route({ method: "POST", path: "/comments/{id}/resolve", summary: "Resolve or reopen a comment thread" })
		.input(CommentResolveInputSchema)
		.output(CommentSchema),
	create: base
		.errors({ ...archived, ...pickErrors(["COMMENT_PARENT_MISMATCH"]) })
		.route({ method: "POST", path: "/tickets/{ticket}/comments", successStatus: 201, summary: "Add a comment" })
		.input(CommentCreateInputSchema)
		.output(CommentSchema),
	update: base
		.errors(archived)
		.route({ method: "PATCH", path: "/comments/{id}", summary: "Edit a comment body" })
		.input(CommentUpdateInputSchema)
		.output(CommentSchema),
	delete: base
		.errors({ ...archived, ...pickErrors(["COMMENT_HAS_REPLIES"]) })
		.route({ method: "DELETE", path: "/comments/{id}", summary: "Delete a comment" })
		.input(CommentIdInputSchema)
		.output(CommentDeleteOutputSchema),
};
