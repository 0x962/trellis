import { call, os } from "./base.ts";

export const evidence = os.evidence.router({
	workspace: os.evidence.workspace.handler(({ context, input }) => call(context, "evidence.workspace", input)),
	file: os.evidence.file.handler(({ context, input }) => call(context, "evidence.file", input)),
	check: os.evidence.check.handler(({ context, input }) => call(context, "evidence.check", input)),
	register: os.evidence.register.handler(({ context, input }) => call(context, "evidence.register", input)),
	list: os.evidence.list.handler(({ context, input }) => call(context, "evidence.list", input)),
});
