import type { LabelGroup } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const labelGroups = os.labelGroups.router({
	create: os.labelGroups.create.handler(async ({ context, input }) => {
		const group = await call<LabelGroup>(context, "labelGroups.create", input);
		setLocation(context, `/api/projects/${input.project}/label-groups/${group.id}`);
		return group;
	}),
	update: os.labelGroups.update.handler(({ context, input }) => call(context, "labelGroups.update", input)),
	delete: os.labelGroups.delete.handler(({ context, input }) => call(context, "labelGroups.delete", input)),
});
