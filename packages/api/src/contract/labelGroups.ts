import { pickErrors } from "../errors.ts";
import {
	LabelCreateInputSchema,
	LabelGroupCreateInputSchema,
	LabelGroupListInputSchema,
	LabelGroupListOutputSchema,
	LabelGroupSchema,
	LabelSchema,
} from "../schemas/label.ts";
import { base } from "./base.ts";

export const labelGroups = {
	list: base
		.route({ method: "GET", path: "/projects/{project}/label-groups", summary: "List a project's label groups" })
		.input(LabelGroupListInputSchema)
		.output(LabelGroupListOutputSchema),
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
	createLabel: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/projects/{project}/label-groups/{group}/labels",
			successStatus: 201,
			summary: "Create a label in a group",
		})
		.input(LabelCreateInputSchema)
		.output(LabelSchema),
};
