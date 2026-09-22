import { call, os } from "./base.ts";

export const pullRequests = os.pullRequests.router({
	resolve: os.pullRequests.resolve.handler(({ context, input }) => call(context, "pullRequests.resolve", input)),
	list: os.pullRequests.list.handler(({ context, input }) => call(context, "pullRequests.list", input)),
	link: os.pullRequests.link.handler(({ context, input }) => call(context, "pullRequests.link", input)),
	unlink: os.pullRequests.unlink.handler(({ context, input }) => call(context, "pullRequests.unlink", input)),
	refresh: os.pullRequests.refresh.handler(({ context, input }) => call(context, "pullRequests.refresh", input)),
	diff: os.pullRequests.diff.handler(({ context, input }) => call(context, "pullRequests.diff", input)),
	readSummary: os.pullRequests.readSummary.handler(({ context, input }) =>
		call(context, "pullRequests.readSummary", input),
	),
	readSummaryHead: os.pullRequests.readSummaryHead.handler(({ context, input }) =>
		call(context, "pullRequests.readSummaryHead", input),
	),
	writeSummary: os.pullRequests.writeSummary.handler(({ context, input }) =>
		call(context, "pullRequests.writeSummary", input),
	),
	readEvidence: os.pullRequests.readEvidence.handler(({ context, input }) =>
		call(context, "pullRequests.readEvidence", input),
	),
	writeEvidence: os.pullRequests.writeEvidence.handler(({ context, input }) =>
		call(context, "pullRequests.writeEvidence", input),
	),
	readFile: os.pullRequests.readFile.handler(({ context, input }) => call(context, "pullRequests.readFile", input)),
	uploadFile: os.pullRequests.uploadFile.handler(({ context, input }) =>
		call(context, "pullRequests.uploadFile", input),
	),
});
