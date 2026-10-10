import type { Epic } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const epics = os.epics.router({
	whiteboard: os.epics.whiteboard.handler(({ context, input }) => call(context, "epics.whiteboard", input)),
	saveWhiteboard: os.epics.saveWhiteboard.handler(({ context, input }) => call(context, "epics.saveWhiteboard", input)),
	autopilot: os.epics.autopilot.handler(({ context, input }) => call(context, "epics.autopilot", input)),
	setAutopilot: os.epics.setAutopilot.handler(({ context, input }) => call(context, "epics.setAutopilot", input)),
	list: os.epics.list.handler(({ context, input }) => call(context, "epics.list", input)),
	get: os.epics.get.handler(({ context, input }) => call(context, "epics.get", input)),
	create: os.epics.create.handler(async ({ context, input }) => {
		const epic = await call<Epic>(context, "epics.create", input);
		setLocation(context, `/api/epics/${epic.id}`);
		return epic;
	}),
	update: os.epics.update.handler(({ context, input }) => call(context, "epics.update", input)),
	cancel: os.epics.cancel.handler(({ context, input }) => call(context, "epics.cancel", input)),
	delete: os.epics.delete.handler(({ context, input }) => call(context, "epics.delete", input)),
});
