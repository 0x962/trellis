import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	EpicCreateInputSchema,
	EpicDeleteInputSchema,
	EpicDeleteOutputSchema,
	EpicListInputSchema,
	EpicRefInputSchema,
	EpicSchema,
	EpicSummarySchema,
	EpicUpdateInputSchema,
} from "../schemas/epic.ts";
import { base } from "./base.ts";

const write = pickErrors(["PROJECT_ARCHIVED", "DUPLICATE"]);

// `{+epic}` matches a ref with a slash, so `GET /api/epics/OP/routine-runtime`
// reaches the epic. A ULID works in the same place.
export const epics = {
	list: base
		.route({
			method: "GET",
			path: "/epics",
			summary: "List the epics of a project and its sub-projects, open first",
		})
		.input(EpicListInputSchema)
		.output(z.array(EpicSummarySchema)),
	get: base
		.route({ method: "GET", path: "/epics/{+epic}", summary: "Read one epic with its tickets" })
		.input(EpicRefInputSchema)
		.output(EpicSchema),
	create: base
		.errors(write)
		.route({ method: "POST", path: "/epics", successStatus: 201, summary: "Create an epic" })
		.input(EpicCreateInputSchema)
		.output(EpicSchema),
	update: base
		.errors(write)
		.route({ method: "PATCH", path: "/epics/{+epic}", summary: "Change the name, the slug, or the description" })
		.input(EpicUpdateInputSchema)
		.output(EpicSchema),
	delete: base
		.errors(pickErrors(["PROJECT_ARCHIVED", "AGENT_CANNOT_DELETE"]))
		.route({ method: "DELETE", path: "/epics/{+epic}", summary: "Delete an epic and detach its tickets" })
		.input(EpicDeleteInputSchema)
		.output(EpicDeleteOutputSchema),
};
