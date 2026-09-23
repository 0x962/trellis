import { call, os } from "./base.ts";

export const statistics = os.statistics.router({
	get: os.statistics.get.handler(({ context, input }) => call(context, "statistics.get", input)),
});
