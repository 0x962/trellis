import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { AgentRunSchema } from "../schemas/agentRun.ts";
import { UlidSchema } from "../schemas/primitives.ts";
import { base } from "./base.ts";

const delegation = z.object({
	runId: UlidSchema,
	parentRunId: UlidSchema,
	projectId: UlidSchema,
	capacity: z.number().int(),
	brief: z.string(),
	retiredAt: z.string().nullable(),
});
export const submanagers = {
	list: base
		.route({
			method: "GET",
			path: "/submanagers",
			summary: "Inspect your submanagers, their scopes, capacity, and saved assignments",
		})
		.input(z.strictObject({}))
		.output(z.array(delegation.extend({ activeWorkers: z.number(), childCapacity: z.number() }))),
	start: base
		.route({
			method: "POST",
			path: "/submanagers",
			summary:
				"Delegate a child project subtree to a submanager with dedicated worker capacity. Resume a stopped delegation with its saved brief and capacity.",
		})
		.input(
			z.strictObject({
				project: z.string().min(1),
				capacity: z.number().int().min(1).max(64),
				brief: z.string().trim().min(1).max(20000),
				requestId: z.string().min(1).max(200),
				accountId: UlidSchema.optional(),
			}),
		)
		.output(AgentRunSchema),
	resize: base
		.route({
			method: "PATCH",
			path: "/submanagers/{id}",
			summary: "Change a submanager budget within its parent reservation and active worker count",
		})
		.input(z.strictObject({ id: UlidSchema, capacity: z.number().int().min(1).max(64) }))
		.output(delegation),
	retire: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/submanagers/{id}/retire",
			summary:
				"Stop a submanager and return its scope and waits to the parent. Retire its child delegations first. Workers continue.",
		})
		.input(z.strictObject({ id: UlidSchema }))
		.output(z.object({})),
};
