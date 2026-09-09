import { pickErrors } from "../errors.ts";
import {
	CommentCreateInputSchema,
	CommentDeleteOutputSchema,
	CommentIdInputSchema,
	CommentSchema,
	CommentUpdateInputSchema,
} from "../schemas/comment.ts";
import { base } from "./base.ts";

const archived = pickErrors(["PROJECT_ARCHIVED"]);

export const comments = {
	create: base
		.errors(archived)
		.route({ method: "POST", path: "/tickets/{ticket}/comments", successStatus: 201, summary: "Add a comment" })
		.input(CommentCreateInputSchema)
		.output(CommentSchema),
	update: base
		.errors(archived)
		.route({ method: "PATCH", path: "/comments/{id}", summary: "Edit a comment body" })
		.input(CommentUpdateInputSchema)
		.output(CommentSchema),
	delete: base
		.errors(archived)
		.route({ method: "DELETE", path: "/comments/{id}", summary: "Delete a comment" })
		.input(CommentIdInputSchema)
		.output(CommentDeleteOutputSchema),
};
