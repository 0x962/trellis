import { call, os } from "./base.ts";

export const hostIdentity = os.hostIdentity.router({
	describe: os.hostIdentity.describe.handler(({ context }) => call(context, "hostIdentity.describe", {})),
});
