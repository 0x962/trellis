import { call, os } from "./base.ts";
export const usage = os.usage.router({
	mergedWork: os.usage.mergedWork.handler(({ context, input }) => call(context, "usage.mergedWork", input)),
	report: os.usage.report.handler(({ context, input }) => call(context, "usage.report", input)),
	ranking: os.usage.ranking.handler(({ context, input }) => call(context, "usage.ranking", input)),
	accounts: os.usage.accounts.handler(({ context, input }) => call(context, "usage.accounts", input)),
});
