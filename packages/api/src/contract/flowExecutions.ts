import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	FlowExecutionCancelInputSchema,
	FlowExecutionDecisionInputSchema,
	FlowExecutionGetInputSchema,
	FlowExecutionListInputSchema,
	FlowExecutionSchema,
	FlowExecutionStartInputSchema,
} from "../schemas/flowExecution.ts";
import { base } from "./base.ts";
export const flowExecutions = {
	start: base
		.route({ method: "POST", path: "/flow-executions", summary: "Start a native flow for a ticket" })
		.errors(pickErrors(["DUPLICATE", "FLOW_VERSION_CONFLICT", "FLOW_NOT_IN_PROJECT"]))
		.input(FlowExecutionStartInputSchema)
		.output(FlowExecutionSchema),
	get: base
		.route({ method: "GET", path: "/flow-executions/{id}", summary: "Read a flow execution" })
		.input(FlowExecutionGetInputSchema)
		.output(FlowExecutionSchema),
	list: base
		.route({ method: "GET", path: "/flow-executions", summary: "List flow executions" })
		.input(FlowExecutionListInputSchema)
		.output(z.array(FlowExecutionSchema)),
	decide: base
		.route({ method: "POST", path: "/flow-executions/{id}/decision", summary: "Approve or reject a human flow step" })
		.errors(pickErrors(["FLOW_VERSION_CONFLICT"]))
		.input(FlowExecutionDecisionInputSchema)
		.output(FlowExecutionSchema),
	cancel: base
		.route({ method: "POST", path: "/flow-executions/{id}/cancel", summary: "Cancel a native flow" })
		.errors(pickErrors(["FLOW_VERSION_CONFLICT"]))
		.input(FlowExecutionCancelInputSchema)
		.output(FlowExecutionSchema),
};
