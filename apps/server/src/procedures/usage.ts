import { call, os } from "./base.ts";
export const usage = os.usage.router({
	report: os.usage.report.handler(({ context, input }) => call(context, "usage.report", input)),
	accounts: os.usage.accounts.handler(({ context, input }) => call(context, "usage.accounts", input)),
});
