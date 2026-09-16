import { call, os } from "./base.ts";

export const needsYou = os.needsYou.router({
	list: os.needsYou.list.handler(({ context, input }) => call(context, "needsYou.list", input)),
	summary: os.needsYou.summary.handler(({ context, input }) => call(context, "needsYou.summary", input)),
	update: os.needsYou.update.handler(({ context, input }) => call(context, "needsYou.update", input)),
});
