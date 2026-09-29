import { call, os } from "./base.ts";
export const usage = os.usage.router({
	report: os.usage.report.handler(({ context, input }) => call(context, "usage.report", input)),
	ranking: os.usage.ranking.handler(({ context, input }) => call(context, "usage.ranking", input)),
	accounts: os.usage.accounts.handler(({ context, input }) => call(context, "usage.accounts", input)),
});
