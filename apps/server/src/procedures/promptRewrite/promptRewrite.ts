import { call, os } from "../base.ts";

export const promptRewrite = os.promptRewrite.router({
	rewrite: os.promptRewrite.rewrite.handler(({ context, input }) => call(context, "promptRewrite.rewrite", input)),
});
