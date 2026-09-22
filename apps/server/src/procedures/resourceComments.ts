import { call, os } from "./base.ts";

export const resourceComments = os.resourceComments.router({
	list: os.resourceComments.list.handler(({ context, input }) => call(context, "resourceComments.list", input)),
	create: os.resourceComments.create.handler(({ context, input }) => call(context, "resourceComments.create", input)),
	anchors: os.resourceComments.anchors.handler(({ context, input }) =>
		call(context, "resourceComments.anchors", input),
	),
	reply: os.resourceComments.reply.handler(({ context, input }) => call(context, "resourceComments.reply", input)),
	resolve: os.resourceComments.resolve.handler(({ context, input }) =>
		call(context, "resourceComments.resolve", input),
	),
	edit: os.resourceComments.edit.handler(({ context, input }) => call(context, "resourceComments.edit", input)),
	remove: os.resourceComments.remove.handler(({ context, input }) => call(context, "resourceComments.remove", input)),
});
