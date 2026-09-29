import { call, os } from "../base";

export const flowExecutionProcedures = os.flowExecutionsV1.router({
	start: os.flowExecutionsV1.start.handler(({ context, input }) => call(context, "flowExecutionsV1.start", input)),
	decision: os.flowExecutionsV1.decision.handler(({ context, input }) =>
		call(context, "flowExecutionsV1.decision", input),
	),
	cancel: os.flowExecutionsV1.cancel.handler(({ context, input }) => call(context, "flowExecutionsV1.cancel", input)),
	recovery: os.flowExecutionsV1.recovery.handler(({ context, input }) =>
		call(context, "flowExecutionsV1.recovery", input),
	),
	output: os.flowExecutionsV1.output.handler(({ context, input }) => call(context, "flowExecutionsV1.output", input)),
});
