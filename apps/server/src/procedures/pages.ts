import { call, os, withIfMatch } from "./base.ts";

export const pages = os.pages.router({
	list: os.pages.list.handler(({ context, input }) => call(context, "pages.list", input)),
	get: os.pages.get.handler(({ context, input }) => call(context, "pages.get", input)),
	update: os.pages.update.handler(({ context, input }) => call(context, "pages.update", withIfMatch(context, input))),
	pin: os.pages.pin.handler(({ context, input }) => call(context, "pages.pin", input)),
	delete: os.pages.delete.handler(({ context, input }) => call(context, "pages.delete", withIfMatch(context, input))),
	restore: os.pages.restore.handler(({ context, input }) =>
		call(context, "pages.restore", withIfMatch(context, input)),
	),
});
