import { call, os } from "./base.ts";

export const sessionObservers = os.sessionObservers.router({
	get: os.sessionObservers.get.handler(({ context, input }) => call(context, "sessionObservers.get", input)),
	history: os.sessionObservers.history.handler(({ context, input }) =>
		call(context, "sessionObservers.history", input),
	),
	setEnabled: os.sessionObservers.setEnabled.handler(({ context, input }) =>
		call(context, "sessionObservers.setEnabled", input),
	),
});
