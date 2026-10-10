import { call, os } from "./base.ts";

export const waves = os.waves.router({
	create: os.waves.create.handler(({ context, input }) => call(context, "waves.create", input)),
	update: os.waves.update.handler(({ context, input }) => call(context, "waves.update", input)),
	reorder: os.waves.reorder.handler(({ context, input }) => call(context, "waves.reorder", input)),
	delete: os.waves.delete.handler(({ context, input }) => call(context, "waves.delete", input)),
});
