import { call, os } from "./base.ts";

export const personas = os.personas.router({
	delete: os.personas.delete.handler(({ context, input }) => call(context, "personas.delete", input)),
	list: os.personas.list.handler(({ context, input }) => call(context, "personas.list", input)),
	get: os.personas.get.handler(({ context, input }) => call(context, "personas.get", input)),
	create: os.personas.create.handler(({ context, input }) => call(context, "personas.create", input)),
	update: os.personas.update.handler(({ context, input }) => call(context, "personas.update", input)),
});
