import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	SessionArchiveInputSchema,
	SessionCreateInputSchema,
	SessionDetailSchema,
	SessionIdInputSchema,
	SessionMoveInputSchema,
	SessionRenameInputSchema,
	SessionSchema,
} from "../schemas/session.ts";
import { base } from "./base.ts";

export const sessions = {
	activity: base
		.route({ method: "GET", path: "/sessions/activity", summary: "Read session activity" })
		.input(z.strictObject({}))
		.output(z.array(SessionDetailSchema)),
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
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "SESSION_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/sessions/{id}/start",
			summary: "Start the agent of an idle session again, in its saved conversation when the harness kept one",
		})
		.input(SessionIdInputSchema)
		.output(SessionDetailSchema),
	move: base
		.errors(pickErrors(["SESSION_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/sessions/{id}/project",
			summary: "Move a session to a project, or clear its project",
		})
		.input(SessionMoveInputSchema)
		.output(SessionSchema),
	rename: base
		.route({
			method: "POST",
			path: "/sessions/{id}/name",
			summary: "Rename a session",
		})
		.input(SessionRenameInputSchema)
		.output(SessionSchema),
	setArchived: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "PUT",
			path: "/sessions/{id}/archived",
			summary: "Archive a session, which stops its agent and keeps its files, or unarchive it",
		})
		.input(SessionArchiveInputSchema)
		.output(SessionSchema),
	delete: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "DELETE", path: "/sessions/{id}", summary: "Stop the agent and delete the session directory" })
		.input(SessionIdInputSchema)
		.output(SessionIdInputSchema),
};
