import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { AgentRunSchema } from "../schemas/agentRun.ts";
import { UlidSchema } from "../schemas/primitives.ts";
import { base } from "./base.ts";

const delegation = z.object({
	runId: UlidSchema,
	parentRunId: UlidSchema,
	projectId: UlidSchema,
	brief: z.string(),
	retiredAt: z.string().nullable(),
});
export const submanagers = {
	list: base
		.route({
			method: "GET",
			path: "/submanagers",
			summary: "Inspect your submanagers, their scopes, and saved assignments",
		})
		.input(z.strictObject({}))
		.output(z.array(delegation)),
	start: base
		.route({
			method: "POST",
			path: "/submanagers",
			summary: "Delegate a child project subtree to a submanager. Resume a stopped delegation with its saved brief.",
		})
		.input(
			z.strictObject({
				project: z.string().min(1),
				brief: z.string().trim().min(1).max(20000),
				requestId: z.string().min(1).max(200),
				accountId: UlidSchema.optional(),
			}),
		)
		.output(AgentRunSchema),
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
