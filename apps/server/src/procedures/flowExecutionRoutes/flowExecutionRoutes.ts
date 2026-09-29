import { call, os } from "../base";

export const flowExecutionProcedures = os.flowExecutionsV1.router({
	recovery: os.flowExecutionsV1.recovery.handler(({ context, input }) =>
		call(context, "flowExecutionsV1.recovery", input),
	),
	output: os.flowExecutionsV1.output.handler(({ context, input }) => call(context, "flowExecutionsV1.output", input)),
});
