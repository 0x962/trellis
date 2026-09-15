import { call, os } from "./base.ts";

export const controller = os.controller.router({
	list: os.controller.list.handler(({ context, input }) => call(context, "controller.list", input)),
	handle: os.controller.handle.handler(({ context, input }) => call(context, "controller.handle", input)),
	retry: os.controller.retry.handler(({ context, input }) => call(context, "controller.retry", input)),
	resolveUnknown: os.controller.resolveUnknown.handler(({ context, input }) =>
		call(context, "controller.resolveUnknown", input),
	),
});
