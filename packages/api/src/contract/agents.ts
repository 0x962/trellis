import { pickErrors } from "../errors.ts";
import {
	AgentInboxInputSchema,
	AgentInboxOutputSchema,
	AgentRegisterInputSchema,
	AgentRetryManagerInputSchema,
	AgentRunnerProjectsOutputSchema,
	AgentSessionSchema,
	AgentSessionsInputSchema,
	AgentSessionsOutputSchema,
	AgentSettingsSchema,
	AgentSettingsSetInputSchema,
	AgentStartBuilderInputSchema,
	AgentStartReviewerInputSchema,
	AgentStopInputSchema,
	AgentsOverviewSchema,
	AgentWakeInputSchema,
} from "../schemas/agent.ts";
import { base } from "./base.ts";

// The inbox moves the stored cursor, so it is a POST: a retried or
// prefetched GET would skip changes for the manager.
export const agents = {
	sessions: base
		.route({ method: "GET", path: "/agents/sessions", summary: "List the agent sessions of a project or a ticket" })
		.input(AgentSessionsInputSchema)
		.output(AgentSessionsOutputSchema),
	inbox: base
		.route({
			method: "POST",
			path: "/agents/inbox",
			summary: "Read the changes after the manager's cursor and advance the cursor",
		})
		.input(AgentInboxInputSchema)
		.output(AgentInboxOutputSchema),
	register: base
		.route({ method: "POST", path: "/agents/register", summary: "Record the session of a running agent" })
		.input(AgentRegisterInputSchema)
		.output(AgentSessionSchema),
	startBuilder: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "CONCURRENCY_LIMIT", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/agents/builder", summary: "Start a builder agent for a ticket" })
		.input(AgentStartBuilderInputSchema)
		.output(AgentSessionSchema),
	startReviewer: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "INVALID_PR_URL", "PROJECT_ARCHIVED"]))
		.route({ method: "POST", path: "/agents/reviewer", summary: "Start a reviewer agent in the builder's workspace" })
		.input(AgentStartReviewerInputSchema)
		.output(AgentSessionSchema),
	stop: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "POST", path: "/agents/sessions/{id}/stop", summary: "Stop an agent session" })
		.input(AgentStopInputSchema)
		.output(AgentSessionSchema),
	wake: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "POST", path: "/agents/wake", summary: "Type a text into the manager's terminal" })
		.input(AgentWakeInputSchema)
		.output(AgentSessionSchema),
	// A start that fails answers the session in state `failed` with the
	// runner's message, so the caller reads why.
	retryManager: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "POST", path: "/agents/manager/retry", summary: "Start the manager of a project again" })
		.input(AgentRetryManagerInputSchema)
		.output(AgentSessionSchema),
	overview: base
		.route({
			method: "GET",
			path: "/agents/overview",
			summary: "List every agent session, the last agent actions, and the recent batches",
		})
		.output(AgentsOverviewSchema),
	settings: base
		.route({ method: "GET", path: "/agents/settings", summary: "Read the agent settings" })
		.output(AgentSettingsSchema),
	// The settings page fills its runner project picker from this list.
	runnerProjects: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "GET",
			path: "/agents/runner-projects",
			summary: "List the projects the runner knows and the project each trellis project matches",
		})
		.output(AgentRunnerProjectsOutputSchema),
	setSettings: base
		.route({ method: "PUT", path: "/agents/settings", summary: "Replace the agent settings" })
		.input(AgentSettingsSetInputSchema)
		.output(AgentSettingsSchema),
};
