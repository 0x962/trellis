import { call, os } from "./base.ts";

export const sessionUpdates = os.sessionUpdates.router({
	get: os.sessionUpdates.get.handler(({ context, input }) => call(context, "sessionUpdates.get", input)),
	write: os.sessionUpdates.write.handler(({ context, input }) => call(context, "sessionUpdates.write", input)),
});
