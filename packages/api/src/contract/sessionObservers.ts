import { pickErrors } from "../errors.ts";
import {
	SessionObserverGetInputSchema,
	SessionObserverHistoryInputSchema,
	SessionObserverHistorySchema,
	SessionObserverSchema,
	SessionObserverSetEnabledInputSchema,
} from "../schemas/sessionObservers/index.ts";
import { base } from "./base.ts";

export const sessionObservers = {
	get: base
		.route({ method: "GET", path: "/session-observers/{sessionId}", summary: "Read the observer of a session" })
		.input(SessionObserverGetInputSchema)
		.output(SessionObserverSchema),
	history: base
		.route({
			method: "GET",
			path: "/session-observers/{sessionId}/history",
			summary: "Read the observer conversation of a session",
		})
		.input(SessionObserverHistoryInputSchema)
		.output(SessionObserverHistorySchema),
	setEnabled: base
		.errors(pickErrors(["SESSION_OBSERVER_FORBIDDEN"]))
		.route({
			method: "PUT",
			path: "/session-observers/{sessionId}/enabled",
			summary: "Enable or disable a session observer",
		})
		.input(SessionObserverSetEnabledInputSchema)
		.output(SessionObserverSchema),
};
