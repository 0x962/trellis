import type { Label, LabelGroup } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const labelGroups = os.labelGroups.router({
	list: os.labelGroups.list.handler(({ context, input }) => call(context, "labelGroups.list", input)),
	create: os.labelGroups.create.handler(async ({ context, input }) => {
		const group = await call<LabelGroup>(context, "labelGroups.create", input);
		setLocation(context, `/api/projects/${input.project}/label-groups/${group.id}`);
		return group;
	}),
	createLabel: os.labelGroups.createLabel.handler(async ({ context, input }) => {
		const label = await call<Label>(context, "labelGroups.createLabel", input);
		setLocation(context, `/api/projects/${input.project}/label-groups/${input.group}/labels/${label.id}`);
		return label;
	}),
});
