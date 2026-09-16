import { z } from "zod";
import {
	HarnessAccountCreateSchema,
	HarnessAccountQuotaSchema,
	HarnessAccountSchema,
	HarnessAccountUpdateSchema,
} from "../schemas/harnessAccount.ts";
import { UlidSchema } from "../schemas/primitives.ts";
import { base } from "./base.ts";

export const harnessAccounts = {
	list: base
		.route({
			method: "GET",
			path: "/harness-accounts",
			summary: "List configured harness accounts and their launch, resume, and quota capabilities",
		})
		.input(z.strictObject({}))
		.output(z.array(HarnessAccountSchema)),
	create: base
		.route({ method: "POST", path: "/harness-accounts", summary: "Add a harness account in machine settings" })
		.input(HarnessAccountCreateSchema)
		.output(HarnessAccountSchema),
	update: base
		.route({ method: "PATCH", path: "/harness-accounts/{id}", summary: "Update a harness account" })
		.input(HarnessAccountUpdateSchema)
		.output(HarnessAccountSchema),
	remove: base
		.route({
			method: "DELETE",
			path: "/harness-accounts/{id}",
			summary: "Remove an account from Trellis without deleting its profile or credentials",
		})
		.input(z.strictObject({ id: UlidSchema }))
		.output(z.object({ id: UlidSchema })),
	quota: base
		.route({
			method: "GET",
			path: "/harness-accounts/{id}/quota",
			summary:
				"Read account quota windows and reset times. Results are cached for five minutes; unavailable quota is not zero quota.",
		})
		.input(z.strictObject({ id: UlidSchema, refresh: z.boolean().optional() }))
		.output(HarnessAccountQuotaSchema),
};
