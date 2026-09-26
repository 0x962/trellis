import { call, os } from "./base.ts";

export const internalLinks = os.internalLinks.router({
	resolve: os.internalLinks.resolve.handler(({ context, input }) => call(context, "internalLinks.resolve", input)),
});
