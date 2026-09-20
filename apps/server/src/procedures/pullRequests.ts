import { call, os } from "./base.ts";

export const pullRequests = os.pullRequests.router({
	list: os.pullRequests.list.handler(({ context, input }) => call(context, "pullRequests.list", input)),
	link: os.pullRequests.link.handler(({ context, input }) => call(context, "pullRequests.link", input)),
	unlink: os.pullRequests.unlink.handler(({ context, input }) => call(context, "pullRequests.unlink", input)),
	refresh: os.pullRequests.refresh.handler(({ context, input }) => call(context, "pullRequests.refresh", input)),
	diff: os.pullRequests.diff.handler(({ context, input }) => call(context, "pullRequests.diff", input)),
	readSummary: os.pullRequests.readSummary.handler(({ context, input }) =>
		call(context, "pullRequests.readSummary", input),
	),
	writeSummary: os.pullRequests.writeSummary.handler(({ context, input }) =>
		call(context, "pullRequests.writeSummary", input),
	),
});
