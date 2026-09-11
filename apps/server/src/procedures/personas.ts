import { call, os } from "./base.ts";

export const personas = os.personas.router({
	list: os.personas.list.handler(({ context, input }) => call(context, "personas.list", input)),
	create: os.personas.create.handler(({ context, input }) => call(context, "personas.create", input)),
	update: os.personas.update.handler(({ context, input }) => call(context, "personas.update", input)),
});
