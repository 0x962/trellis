import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	FlowExecutionCancelInputSchema,
	FlowExecutionDecisionInputSchema,
	FlowExecutionStartInputSchema,
} from "../schemas/flowExecution.ts";
import {
	FlowAttemptOutputV1InputSchema,
	FlowAttemptOutputV1Schema,
	FlowRecoveryV1Schema,
} from "../schemas/flowExecutionActionsV1.ts";
import { FlowExecutionViewV1Schema } from "../schemas/flowExecutionViewV1.ts";
import { base } from "./base.ts";
import { flowDocumentV1Errors } from "./flowDocumentsV1.ts";

export const flowActionV1Errors = {
	...pickErrors(["FLOW_VERSION_CONFLICT"]),
	FLOW_REQUEST_CONFLICT: {
		status: 409,
		message: "This request ID already identifies different action bytes.",
		data: z.strictObject({ requestId: z.string() }),
	},
	FLOW_ACTION_PENDING: {
		status: 409,
		message: "The flow action has no confirmed receipt. Read its current view before another action.",
		data: z.strictObject({ requestId: z.string() }),
	},
	FLOW_RUNTIME_UNAVAILABLE: {
		status: 503,
		message: "The flow runtime is unavailable.",
		data: z.undefined(),
	},
	FLOW_RECOVERY_BLOCKED: {
		status: 409,
		message: "Flow actions are blocked until recovery completes.",
		data: z.strictObject({ generation: z.number().int().positive() }),
	},
};

const mutation = base.errors(flowActionV1Errors);
export const flowExecutionsV1 = {
	start: mutation
		.route({ method: "POST", path: "/flow-executions/start-v1", summary: "Start or reuse an execution" })
		.errors({
			...pickErrors(["DUPLICATE", "FLOW_NOT_IN_PROJECT"]),
			FLOW_UNSUPPORTED_FORMAT: flowDocumentV1Errors.FLOW_UNSUPPORTED_FORMAT,
		})
		.input(FlowExecutionStartInputSchema)
		.output(FlowExecutionViewV1Schema),
	decision: mutation
		.route({ method: "POST", path: "/flow-executions/{id}/decision-v1", summary: "Record a human decision" })
		.input(FlowExecutionDecisionInputSchema)
		.output(FlowExecutionViewV1Schema),
	cancel: mutation
		.route({ method: "POST", path: "/flow-executions/{id}/cancel-v1", summary: "Request execution cancellation" })
		.input(FlowExecutionCancelInputSchema)
		.output(FlowExecutionViewV1Schema),
	recovery: base
		.route({ method: "GET", path: "/flow-executions/recovery-v1", summary: "Read the host recovery state" })
		.input(z.strictObject({}))
		.output(FlowRecoveryV1Schema),
	output: base
		.route({
			method: "GET",
			path: "/flow-executions/{executionId}/output-v1",
			summary: "Read an exact retained result",
		})
		.input(FlowAttemptOutputV1InputSchema)
		.output(FlowAttemptOutputV1Schema),
};
