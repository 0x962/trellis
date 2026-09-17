import { call, os } from "./base.ts";
export const harnessAccounts = os.harnessAccounts.router({
	list: os.harnessAccounts.list.handler(({ context, input }) => call(context, "harnessAccounts.list", input)),
	create: os.harnessAccounts.create.handler(({ context, input }) => call(context, "harnessAccounts.create", input)),
	update: os.harnessAccounts.update.handler(({ context, input }) => call(context, "harnessAccounts.update", input)),
	remove: os.harnessAccounts.remove.handler(({ context, input }) => call(context, "harnessAccounts.remove", input)),
	quota: os.harnessAccounts.quota.handler(({ context, input }) => call(context, "harnessAccounts.quota", input)),
});
