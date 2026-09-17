import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	SessionCreateInputSchema,
	SessionDetailSchema,
	SessionIdInputSchema,
	SessionSchema,
	SessionSendInputSchema,
} from "../schemas/session.ts";
import { base } from "./base.ts";

export const sessions = {
	send: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "PAYLOAD_TOO_LARGE"]))
		.route({ method: "POST", path: "/sessions/send", summary: "Send a message and files to an agent" })
		.input(SessionSendInputSchema)
		.output(z.object({ id: z.string() })),
	list: base
		.route({ method: "GET", path: "/sessions", summary: "List sessions, newest first" })
		.input(z.strictObject({}))
		.output(z.array(SessionSchema)),
	get: base
		.route({ method: "GET", path: "/sessions/{id}", summary: "Read one session with the state of its agent" })
		.input(SessionIdInputSchema)
		.output(SessionDetailSchema),
	create: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "PAYLOAD_TOO_LARGE"]))
		.route({
			method: "POST",
			path: "/sessions",
			successStatus: 201,
			summary: "Create an agent session in a project worktree or a scratch repository",
		})
		.input(SessionCreateInputSchema)
		.output(SessionDetailSchema),
	start: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/sessions/{id}/start",
			summary: "Start the agent of a stopped session again, in its saved conversation when the harness kept one",
		})
		.input(SessionIdInputSchema)
		.output(SessionDetailSchema),
	delete: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "DELETE", path: "/sessions/{id}", summary: "Stop the agent and delete the session directory" })
		.input(SessionIdInputSchema)
		.output(SessionIdInputSchema),
};
