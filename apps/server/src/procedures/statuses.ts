import type { Status } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const statuses = os.statuses.router({
	list: os.statuses.list.handler(({ context, input }) => call(context, "statuses.list", input)),
	create: os.statuses.create.handler(async ({ context, input }) => {
		const status = await call<Status>(context, "statuses.create", input);
		setLocation(context, `/api/projects/${input.project}/statuses/${status.id}`);
		return status;
	}),
	update: os.statuses.update.handler(({ context, input }) => call(context, "statuses.update", input)),
	reorder: os.statuses.reorder.handler(({ context, input }) => call(context, "statuses.reorder", input)),
	delete: os.statuses.delete.handler(({ context, input }) => call(context, "statuses.delete", input)),
});
