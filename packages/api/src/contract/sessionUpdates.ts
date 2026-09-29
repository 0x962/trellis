import {
	SessionUpdateSchema,
	SessionUpdatesGetInputSchema,
	SessionUpdatesSchema,
	SessionUpdatesWriteInputSchema,
} from "../schemas/sessionUpdates/index.ts";
import { base } from "./base.ts";

export const sessionUpdates = {
	get: base
		.route({ method: "GET", path: "/session-updates/{sessionId}", summary: "Read the latest session updates" })
		.input(SessionUpdatesGetInputSchema)
		.output(SessionUpdatesSchema),
	write: base
		.route({
			method: "POST",
			path: "/session-updates/{sessionId}",
			successStatus: 201,
			summary: "Save a status update from the agent of a session",
		})
		.input(SessionUpdatesWriteInputSchema)
		.output(SessionUpdateSchema),
};
