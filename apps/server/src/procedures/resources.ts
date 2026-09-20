import { call, os } from "./base.ts";

export const resources = os.resources.router({
	add: os.resources.add.handler(({ context, input }) => call(context, "resources.add", input)),
	list: os.resources.list.handler(({ context, input }) => call(context, "resources.list", input)),
	remove: os.resources.remove.handler(({ context, input }) => call(context, "resources.remove", input)),
});
