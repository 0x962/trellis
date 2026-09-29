import {
	SessionObserverGetInputSchema,
	SessionObserverSchema,
	SessionObserverSetEnabledInputSchema,
} from "../schemas/sessionObservers/index.ts";
import { base } from "./base.ts";

export const sessionObservers = {
	get: base
		.route({ method: "GET", path: "/session-observers/{sessionId}", summary: "Read the observer of a session" })
		.input(SessionObserverGetInputSchema)
		.output(SessionObserverSchema),
	setEnabled: base
		.route({
			method: "PUT",
			path: "/session-observers/{sessionId}/enabled",
			summary: "Enable or disable a session observer",
		})
		.input(SessionObserverSetEnabledInputSchema)
		.output(SessionObserverSchema),
};
