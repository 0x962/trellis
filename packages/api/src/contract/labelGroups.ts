import { pickErrors } from "../errors.ts";
import {
	LabelGroupCreateInputSchema,
	LabelGroupDeleteInputSchema,
	LabelGroupDeleteOutputSchema,
	LabelGroupSchema,
	LabelGroupUpdateInputSchema,
} from "../schemas/label.ts";
import { base } from "./base.ts";

// `labels.list` returns the groups with the labels. `{project}` is any
// project of the tree. `{group}` is the group ULID.
export const labelGroups = {
	create: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/projects/{project}/label-groups",
			successStatus: 201,
			summary: "Create a label group",
		})
		.input(LabelGroupCreateInputSchema)
		.output(LabelGroupSchema),
	update: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({
			method: "PATCH",
			path: "/projects/{project}/label-groups/{group}",
			summary: "Rename a label group",
		})
		.input(LabelGroupUpdateInputSchema)
		.output(LabelGroupSchema),
	delete: base
		.errors(pickErrors(["AGENT_CANNOT_DELETE", "DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({
			method: "DELETE",
			path: "/projects/{project}/label-groups/{group}",
			summary: "Delete a label group, and ungroup or delete its labels",
		})
		.input(LabelGroupDeleteInputSchema)
		.output(LabelGroupDeleteOutputSchema),
};
