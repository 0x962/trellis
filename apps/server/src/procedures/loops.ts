import { call, os } from "./base.ts";

export const loops = os.loops.router({
	list: os.loops.list.handler(({ context, input }) => call(context, "loops.list", input)),
	control: os.loops.control.handler(({ context, input }) => call(context, "loops.control", input)),
});
