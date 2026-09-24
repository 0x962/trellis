import type { PageDetail } from "@trellis/api";
import { call, os, withIfMatch } from "./base.ts";

export const pages = os.pages.router({
	list: os.pages.list.handler(({ context, input }) => call(context, "pages.list", input)),
	get: os.pages.get.handler(async ({ context, input }) => {
		const page = await call<PageDetail>(context, "pages.get", input);
		context.resHeaders?.set("etag", `"${page.revision}"`);
		return page;
	}),
	update: os.pages.update.handler(({ context, input }) => call(context, "pages.update", withIfMatch(context, input))),
	pin: os.pages.pin.handler(({ context, input }) => call(context, "pages.pin", input)),
	delete: os.pages.delete.handler(({ context, input }) => call(context, "pages.delete", withIfMatch(context, input))),
	restore: os.pages.restore.handler(({ context, input }) =>
		call(context, "pages.restore", withIfMatch(context, input)),
	),
});
