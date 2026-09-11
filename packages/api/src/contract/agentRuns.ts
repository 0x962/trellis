import { z } from "zod";
import { AgentRunListInputSchema, AgentRunSchema, AgentRunStartInputSchema } from "../schemas/agentRun.ts";
import { UlidSchema } from "../schemas/primitives.ts";
import { base } from "./base.ts";

const idInput = z.strictObject({ id: UlidSchema });
export const agentRuns = {
	send: base
		.route({ method: "POST", path: "/agent-runs/{id}/send", summary: "Send an agent a follow-up" })
		.input(idInput.extend({ text: z.string().trim().min(1).max(20000) }))
		.output(AgentRunSchema),
	output: base
		.route({ method: "GET", path: "/agent-runs/{id}/output", summary: "Read agent output" })
		.input(idInput)
		.output(z.object({ text: z.string() })),
	list: base
		.route({ method: "GET", path: "/agent-runs", summary: "List agents" })
		.input(AgentRunListInputSchema)
		.output(z.array(AgentRunSchema)),
	start: base
		.route({ method: "POST", path: "/agent-runs", successStatus: 201, summary: "Start an agent from a persona" })
		.input(AgentRunStartInputSchema)
		.output(AgentRunSchema),
	stop: base
		.route({ method: "POST", path: "/agent-runs/{id}/stop", summary: "Stop an agent" })
		.input(idInput)
		.output(AgentRunSchema),
	refresh: base
		.route({ method: "POST", path: "/agent-runs/{id}/refresh", summary: "Check an agent terminal" })
		.input(idInput)
		.output(AgentRunSchema),
};
