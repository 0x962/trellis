import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	ProviderCheckSchema,
	ProviderCreateInputSchema,
	ProviderIdInputSchema,
	ProviderModelsSchema,
	ProviderPublicModelsInputSchema,
	ProviderRemoteInputSchema,
	ProviderSchema,
	ProviderUpdateInputSchema,
} from "../schemas/provider.ts";
import { base } from "./base.ts";

const write = pickErrors(["DUPLICATE"]);

export const providers = {
	models: base
		.route({ method: "GET", path: "/providers/{id}/models", summary: "Read the provider model catalog" })
		.input(ProviderRemoteInputSchema)
		.output(ProviderModelsSchema),
	publicModels: base
		.route({ method: "GET", path: "/providers/kinds/{kind}/models", summary: "Read a public provider model catalog" })
		.input(ProviderPublicModelsInputSchema)
		.output(ProviderModelsSchema),
	check: base
		.route({ method: "GET", path: "/providers/{id}/check", summary: "Check the provider key" })
		.input(ProviderRemoteInputSchema)
		.output(ProviderCheckSchema),
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
