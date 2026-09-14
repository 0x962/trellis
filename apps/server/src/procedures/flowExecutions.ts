import { call, os } from "./base.ts";

export const flowExecutions = os.flowExecutions.router({
	start: os.flowExecutions.start.handler(({ context, input }) => call(context, "flowExecutions.start", input)),
	get: os.flowExecutions.get.handler(({ context, input }) => call(context, "flowExecutions.get", input)),
	list: os.flowExecutions.list.handler(({ context, input }) => call(context, "flowExecutions.list", input)),
	decide: os.flowExecutions.decide.handler(({ context, input }) => call(context, "flowExecutions.decide", input)),
	cancel: os.flowExecutions.cancel.handler(({ context, input }) => call(context, "flowExecutions.cancel", input)),
});
