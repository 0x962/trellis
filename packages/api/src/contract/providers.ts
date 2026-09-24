import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	ProviderCreateInputSchema,
	ProviderIdInputSchema,
	ProviderSchema,
	ProviderUpdateInputSchema,
} from "../schemas/provider.ts";
import { base } from "./base.ts";

const write = pickErrors(["DUPLICATE"]);

export const providers = {
	list: base
		.route({ method: "GET", path: "/providers", summary: "List external model providers by name" })
		.input(z.strictObject({}))
		.output(z.array(ProviderSchema)),
	get: base
		.route({ method: "GET", path: "/providers/{id}", summary: "Read one external model provider" })
		.input(ProviderIdInputSchema)
		.output(ProviderSchema),
	create: base
		.errors(write)
		.route({ method: "POST", path: "/providers", successStatus: 201, summary: "Create an external model provider" })
		.input(ProviderCreateInputSchema)
		.output(ProviderSchema),
	update: base
		.errors(write)
		.route({ method: "PATCH", path: "/providers/{id}", summary: "Update an external model provider" })
		.input(ProviderUpdateInputSchema)
		.output(ProviderSchema),
	delete: base
		.route({ method: "DELETE", path: "/providers/{id}", summary: "Delete an external model provider" })
		.input(ProviderIdInputSchema)
		.output(ProviderIdInputSchema),
};
