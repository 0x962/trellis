import { call, os } from "./base.ts";
export const submanagers = os.submanagers.router({
	list: os.submanagers.list.handler(({ context, input }) => call(context, "submanagers.list", input)),
	start: os.submanagers.start.handler(({ context, input }) => call(context, "submanagers.start", input)),
	resize: os.submanagers.resize.handler(({ context, input }) => call(context, "submanagers.resize", input)),
	retire: os.submanagers.retire.handler(({ context, input }) => call(context, "submanagers.retire", input)),
});
