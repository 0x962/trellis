import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	ResourceAddInputSchema,
	ResourceIdInputSchema,
	ResourceListInputSchema,
	ResourceRemoveOutputSchema,
	ResourceSchema,
	ResourceUpdateInputSchema,
} from "../schemas/resource.ts";
import { base } from "./base.ts";

export const resources = {
	add: base
		.errors(pickErrors(["PAYLOAD_TOO_LARGE", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/resources", successStatus: 201, summary: "Add a resource to an epic" })
		.input(ResourceAddInputSchema)
		.output(ResourceSchema),
	list: base
		.route({ method: "GET", path: "/resources", summary: "List the resources of an epic" })
		.input(ResourceListInputSchema)
		.output(z.array(ResourceSchema)),
	update: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "PATCH", path: "/resources/{id}", summary: "Update a document resource" })
		.input(ResourceUpdateInputSchema)
		.output(ResourceSchema),
	remove: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "DELETE", path: "/resources/{id}", summary: "Remove a resource from an epic" })
		.input(ResourceIdInputSchema)
		.output(ResourceRemoveOutputSchema),
};
