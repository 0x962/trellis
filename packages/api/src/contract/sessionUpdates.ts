import { pickErrors } from "../errors.ts";
import {
	SessionUpdateSchema,
	SessionUpdatesGetInputSchema,
	SessionUpdatesSchema,
	SessionUpdatesWriteInputSchema,
} from "../schemas/sessionUpdates/index.ts";
import { base } from "./base.ts";

export const sessionUpdates = {
	get: base
		.route({
			method: "GET",
			path: "/session-updates/{sessionId}",
			summary: "Read session updates and retained history",
		})
		.input(SessionUpdatesGetInputSchema)
		.output(SessionUpdatesSchema),
	write: base
		.errors(pickErrors(["SESSION_UPDATE_FORBIDDEN"]))
		.route({
			method: "POST",
			path: "/session-updates/{sessionId}",
			summary: "Save a status update from the agent of a session",
		})
		.input(SessionUpdatesWriteInputSchema)
		.output(SessionUpdateSchema),
};
