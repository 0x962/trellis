import { call, os } from "./base.ts";

export const milestones = os.milestones.router({
	create: os.milestones.create.handler(({ context, input }) => call(context, "milestones.create", input)),
	update: os.milestones.update.handler(({ context, input }) => call(context, "milestones.update", input)),
	reorder: os.milestones.reorder.handler(({ context, input }) => call(context, "milestones.reorder", input)),
	delete: os.milestones.delete.handler(({ context, input }) => call(context, "milestones.delete", input)),
});
