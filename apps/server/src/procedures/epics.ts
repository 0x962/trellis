import type { Epic } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const epics = os.epics.router({
	list: os.epics.list.handler(({ context, input }) => call(context, "epics.list", input)),
	get: os.epics.get.handler(({ context, input }) => call(context, "epics.get", input)),
	create: os.epics.create.handler(async ({ context, input }) => {
		const epic = await call<Epic>(context, "epics.create", input);
		setLocation(context, `/api/epics/${epic.id}`);
		return epic;
	}),
	update: os.epics.update.handler(({ context, input }) => call(context, "epics.update", input)),
	delete: os.epics.delete.handler(({ context, input }) => call(context, "epics.delete", input)),
});
