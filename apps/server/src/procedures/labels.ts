import type { Label } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const labels = os.labels.router({
	list: os.labels.list.handler(({ context, input }) => call(context, "labels.list", input)),
	create: os.labels.create.handler(async ({ context, input }) => {
		const label = await call<Label>(context, "labels.create", input);
		setLocation(context, `/api/projects/${input.project}/labels/${label.id}`);
		return label;
	}),
	update: os.labels.update.handler(({ context, input }) => call(context, "labels.update", input)),
	delete: os.labels.delete.handler(({ context, input }) => call(context, "labels.delete", input)),
});
