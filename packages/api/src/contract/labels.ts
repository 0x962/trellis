import { pickErrors } from "../errors.ts";
import {
	LabelCreateInputSchema,
	LabelDeleteInputSchema,
	LabelDeleteOutputSchema,
	LabelListInputSchema,
	LabelListOutputSchema,
	LabelSchema,
	LabelUpdateInputSchema,
} from "../schemas/label.ts";
import { base } from "./base.ts";

// The root project of a tree owns the labels of the tree. `{project}` is any
// project of that tree. `{label}` is the label ULID.
export const labels = {
	list: base
		.route({
			method: "GET",
			path: "/projects/{project}/labels",
			summary: "List the labels and the label groups of a project tree",
		})
		.input(LabelListInputSchema)
		.output(LabelListOutputSchema),
	create: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/projects/{project}/labels",
			successStatus: 201,
			summary: "Create a label, with or without a group",
		})
		.input(LabelCreateInputSchema)
		.output(LabelSchema),
	update: base
		.errors(pickErrors(["DUPLICATE", "LABEL_GROUP_CONFLICT", "PROJECT_ARCHIVED"]))
		.route({
			method: "PATCH",
			path: "/projects/{project}/labels/{label}",
			summary: "Change label fields or move the label to a group",
		})
		.input(LabelUpdateInputSchema)
		.output(LabelSchema),
	delete: base
		.errors(pickErrors(["AGENT_CANNOT_DELETE", "PROJECT_ARCHIVED"]))
		.route({
			method: "DELETE",
			path: "/projects/{project}/labels/{label}",
			summary: "Delete a label and remove it from every ticket",
		})
		.input(LabelDeleteInputSchema)
		.output(LabelDeleteOutputSchema),
};
