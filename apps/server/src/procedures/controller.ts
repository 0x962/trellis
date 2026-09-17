import { call, os } from "./base.ts";

export const controller = os.controller.router({
	actions: os.controller.actions.handler(({ context, input }) => call(context, "controller.actions", input)),
	cancelAction: os.controller.cancelAction.handler(({ context, input }) =>
		call(context, "controller.cancelAction", input),
	),
	list: os.controller.list.handler(({ context, input }) => call(context, "controller.list", input)),
	handle: os.controller.handle.handler(({ context, input }) => call(context, "controller.handle", input)),
	retry: os.controller.retry.handler(({ context, input }) => call(context, "controller.retry", input)),
	resolveUnknown: os.controller.resolveUnknown.handler(({ context, input }) =>
		call(context, "controller.resolveUnknown", input),
	),
});
