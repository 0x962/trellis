import type { Flow } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const flows = os.flows.router({
	list: os.flows.list.handler(({ context, input }) => call(context, "flows.list", input)),
	get: os.flows.get.handler(({ context, input }) => call(context, "flows.get", input)),
	create: os.flows.create.handler(async ({ context, input }) => {
		const flow = await call<Flow>(context, "flows.create", input);
		setLocation(context, `/api/flows/${flow.slug}`);
		return flow;
	}),
	update: os.flows.update.handler(({ context, input }) => call(context, "flows.update", input)),
	save: os.flows.save.handler(({ context, input }) => call(context, "flows.save", input)),
	delete: os.flows.delete.handler(({ context, input }) => call(context, "flows.delete", input)),
});
