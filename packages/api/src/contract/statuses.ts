import { pickErrors } from "../errors.ts";
import {
	StatusClearInputSchema,
	StatusClearOutputSchema,
	StatusCreateInputSchema,
	StatusDeleteInputSchema,
	StatusDeleteOutputSchema,
	StatusListInputSchema,
	StatusListOutputSchema,
	StatusReorderInputSchema,
	StatusSchema,
	StatusUpdateInputSchema,
} from "../schemas/status.ts";
import { base } from "./base.ts";

export const statuses = {
	list: base
		.route({ method: "GET", path: "/projects/{project}/statuses", summary: "Read the effective status set" })
		.input(StatusListInputSchema)
		.output(StatusListOutputSchema),
	create: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/projects/{project}/statuses",
			successStatus: 201,
			summary: "Add a status; a sub-project takes its own copy of the set",
		})
		.input(StatusCreateInputSchema)
		.output(StatusSchema),
	update: base
		.errors(pickErrors(["DUPLICATE", "PROJECT_ARCHIVED", "STATUS_CATEGORY_IMMUTABLE"]))
		.route({ method: "PATCH", path: "/projects/{project}/statuses/{status}", summary: "Change status fields" })
		.input(StatusUpdateInputSchema)
		.output(StatusSchema),
	reorder: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "STATUS_NOT_IN_PROJECT"]))
		.route({ method: "PUT", path: "/projects/{project}/statuses/order", summary: "Set the full status order" })
		.input(StatusReorderInputSchema)
		.output(StatusListOutputSchema),
	delete: base
		.errors(pickErrors(["STATUS_IN_USE", "LAST_STATUS", "STATUS_NOT_IN_PROJECT", "PROJECT_ARCHIVED"]))
		.route({ method: "DELETE", path: "/projects/{project}/statuses/{status}", summary: "Delete a status" })
		.input(StatusDeleteInputSchema)
		.output(StatusDeleteOutputSchema),
	clear: base
		.errors(pickErrors(["ROOT_STATUSES", "PROJECT_ARCHIVED"]))
		.route({
			method: "DELETE",
			path: "/projects/{project}/statuses",
			summary: "Drop a sub-project's own set and inherit again",
		})
		.input(StatusClearInputSchema)
		.output(StatusClearOutputSchema),
};
