import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { ModelIdSchema } from "../models/models.ts";
import { AgentActivitySchema } from "../schemas/agentActivity.ts";
import {
	AgentBroadcastCountsSchema,
	AgentBroadcastInputSchema,
	AgentBroadcastResultSchema,
} from "../schemas/agentBroadcast.ts";
import {
	AgentRunListInputSchema,
	AgentRunPinInputSchema,
	AgentRunPinOutputSchema,
	AgentRunRetryInputSchema,
	AgentRunSchema,
	AgentRunStartInputSchema,
	AgentWorkspaceFileInputSchema,
	AgentWorkspaceFileSchema,
	AgentWorkspaceInputSchema,
	AgentWorkspaceLineStatSchema,
	AgentWorkspaceLineStatsInputSchema,
	AgentWorkspaceSchema,
	AgentWorkspaceSummarySchema,
	TicketMetricsSchema,
} from "../schemas/agentRun.ts";
import { UlidSchema } from "../schemas/primitives.ts";
import { AgentAnswerInputSchema, AgentSeenInputSchema } from "../schemas/sessionActivity.ts";
import { TicketGetInputSchema } from "../schemas/ticket.ts";
import { base } from "./base.ts";

const idInput = z.strictObject({ id: UlidSchema });
const sessionSchema = z.object({
	id: z.string(),
	daemonId: z.string(),
	pid: z.number().nullable(),
	mode: z.enum(["pty", "stdio"]),
	status: z.enum(["running", "exited", "unknown"]),
	startedAt: z.string(),
	endedAt: z.string().nullable(),
	exitCode: z.number().nullable(),
	error: z.string().nullable(),
	checkedAt: z.string(),
	elapsedMs: z.number().nullable(),
	agent: z
		.object({
			sessionId: z.string().nullable(),
			model: z.string().nullable(),
			tokenUsage: z.object({ totalTokens: z.number().int().nonnegative() }).nullable().optional(),
			turnId: z.string().nullable(),
			tool: z
				.object({ id: z.string(), name: z.string(), input: z.unknown().optional(), output: z.unknown().optional() })
				.nullable(),
			lastTool: z
				.object({
					id: z.string(),
					name: z.string(),
					input: z.unknown().optional(),
					output: z.unknown().optional(),
					startedAt: z.string().nullable(),
					updatedAt: z.string(),
					status: z.enum(["running", "completed", "failed"]),
					error: z.string().nullable(),
				})
				.nullable(),
			lastMessage: z.object({ text: z.string(), at: z.string() }).nullable(),
			error: z.string().nullable(),
			outcome: z.enum(["completed", "interrupted", "failed"]).nullable(),
		})
		.nullable(),
	controllable: z.boolean(),
	process: z
		.object({
			pid: z.number(),
			parentPid: z.number(),
			groupId: z.number(),
			identity: z.string(),
			startedAt: z.string(),
			executable: z.string(),
		})
		.nullable(),
	launch: z.object({ command: z.string(), args: z.array(z.string()), cwd: z.string() }).nullable(),
	activity: z.object({ state: z.enum(["ready", "working", "idle"]), updatedAt: z.string() }).nullable(),
	acknowledgedMessageIds: z.array(z.string()),
	result: z.object({ id: z.string(), text: z.string() }).nullable(),
});
export const agentRuns = {
	activity: base
		.route({ method: "GET", path: "/agent-runs/activity", summary: "Read activity for all agent terminals" })
		.input(z.strictObject({}))
		.output(AgentActivitySchema.array()),
	broadcastRecipients: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "GET",
			path: "/agent-runs/broadcast/recipients",
			summary: "Count the working and idle agents that can receive a broadcast",
		})
		.input(z.strictObject({}))
		.output(AgentBroadcastCountsSchema),
	broadcast: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/agent-runs/broadcast",
			summary: "Send one message to every eligible agent in an activity group",
		})
		.input(AgentBroadcastInputSchema)
		.output(AgentBroadcastResultSchema),
	seen: base
		.errors(pickErrors(["SESSION_ATTENTION_CHANGED"]))
		.route({ method: "POST", path: "/agent-runs/{id}/seen", summary: "Acknowledge a session completion" })
		.input(AgentSeenInputSchema)
		.output(z.object({ id: z.string() })),
	answer: base
		.errors(pickErrors(["SESSION_ATTENTION_CHANGED"]))
		.route({ method: "POST", path: "/agent-runs/{id}/answer", summary: "Answer a pending session question" })
		.input(AgentAnswerInputSchema)
		.output(z.object({ id: z.string() })),
	workspaceLineStats: base
		.route({ method: "GET", path: "/agent-runs/workspaces/line-stats", summary: "Read workspace line changes" })
		.input(AgentWorkspaceLineStatsInputSchema)
		.output(z.array(AgentWorkspaceLineStatSchema)),
	workspaceSummary: base
		.route({
			method: "GET",
			path: "/agent-runs/{runId}/workspace/summary",
			summary: "Read the directory, branch, and change counts of the run workspace",
		})
		.input(AgentWorkspaceInputSchema)
		.output(AgentWorkspaceSummarySchema),
	workspace: base
		.route({ method: "GET", path: "/agent-runs/{runId}/workspace", summary: "Inspect the agent workspace" })
		.input(AgentWorkspaceInputSchema)
		.output(AgentWorkspaceSchema),
	file: base
		.route({ method: "GET", path: "/agent-runs/{runId}/workspace/file", summary: "Read a workspace file" })
		.input(AgentWorkspaceFileInputSchema)
		.output(AgentWorkspaceFileSchema),
	switchAccount: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/agent-runs/{id}/account",
			summary: "Switch the account and resume the same conversation",
		})
		.input(
			idInput.extend({
				accountId: UlidSchema,
				expectedTerminalId: z.string().min(1),
				requestId: z.string().min(1).max(200),
				confirmInterrupt: z.boolean().default(false),
			}),
		)
		.output(AgentRunSchema),
	setModel: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "SESSION_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/agent-runs/{id}/model",
			summary: "Change an agent's model, interrupt its active turn, and resume the same conversation and workspace.",
		})
		.input(
			idInput.extend({
				model: ModelIdSchema,
				expectedTerminalId: z.string().min(1),
				requestId: z.string().min(1).max(200),
			}),
		)
		.output(AgentRunSchema),
	resume: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE", "SESSION_ARCHIVED"]))
		.route({
			method: "POST",
			path: "/agent-runs/{id}/resume",
			summary:
				"Resume a stopped assignment with its exact conversation and workspace, optionally with another account of the same harness. Stop and inspect the prior attempt first.",
		})
		.input(
			idInput.extend({
				accountId: UlidSchema.optional(),
				model: ModelIdSchema.optional().describe(
					"Canonical model ID from models.list for this resume. Defaults to the previous attempt's model.",
				),
				expectedTerminalId: z.string().min(1),
				requestId: z.string().min(1).max(200),
			}),
		)
		.output(AgentRunSchema),
	interrupt: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "POST", path: "/agent-runs/{id}/interrupt", summary: "Interrupt the current agent turn" })
		.input(idInput.extend({ expectedTerminalId: z.string().optional(), expectedSessionId: z.string().optional() }))
		.output(z.object({})),
	session: base
		.route({ method: "GET", path: "/agent-runs/{id}/session", summary: "Read the local process" })
		.input(idInput)
		.output(sessionSchema.nullable()),
	terminalOutput: base
		.route({ method: "GET", path: "/agent-runs/{id}/terminal/output", summary: "Read terminal bytes" })
		.input(idInput.extend({ offset: z.number().int().nonnegative().optional() }))
		.output(z.object({ data: z.string(), startOffset: z.number(), nextOffset: z.number(), truncated: z.boolean() })),
	terminalInput: base
		.route({ method: "POST", path: "/agent-runs/{id}/terminal/input", summary: "Write terminal bytes" })
		.input(
			idInput.extend({
				text: z.string().min(1).max(65536),
				userInput: z.boolean().optional(),
				expectedTerminalId: z.string().optional(),
			}),
		)
		.output(z.object({})),
	resize: base
		.route({ method: "POST", path: "/agent-runs/{id}/terminal/resize", summary: "Resize a terminal" })
		.input(
			idInput.extend({
				expectedTerminalId: z.string().optional(),
				cols: z.number().int().min(1).max(1000),
				rows: z.number().int().min(1).max(1000),
			}),
		)
		.output(z.object({})),
	send: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/agent-runs/{id}/send",
			summary: "Send an agent a follow-up. With interrupt, stop the current turn first.",
		})
		.input(idInput.extend({ text: z.string().trim().min(1).max(20000), interrupt: z.boolean().optional() }))
		.output(AgentRunSchema),
	output: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "GET", path: "/agent-runs/{id}/output", summary: "Read agent output" })
		.input(idInput)
		.output(z.object({ text: z.string() })),
	list: base
		.route({ method: "GET", path: "/agent-runs", summary: "List agents" })
		.input(AgentRunListInputSchema)
		.output(z.array(AgentRunSchema)),
	setPinned: base
		.route({ method: "PUT", path: "/agent-runs/{id}/pinned", summary: "Pin or unpin a saved session" })
		.input(AgentRunPinInputSchema)
		.output(AgentRunPinOutputSchema),
	ticketMetrics: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "GET", path: "/tickets/{ticket}/metrics", summary: "Read ticket work metrics" })
		.input(TicketGetInputSchema)
		.output(TicketMetricsSchema),
	start: base
		.route({ method: "POST", path: "/agent-runs", successStatus: 201, summary: "Assign an agent to a ticket" })
		.input(AgentRunStartInputSchema)
		.output(AgentRunSchema),
	retry: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/agent-runs/{id}/retry",
			summary: "Retry an assigned agent run with the same harness, model, effort, account, and instruction.",
		})
		.input(AgentRunRetryInputSchema)
		.output(AgentRunSchema),
	stop: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({ method: "POST", path: "/agent-runs/{id}/stop", summary: "Stop an agent" })
		.input(idInput)
		.output(AgentRunSchema),
	pause: base
		.errors(pickErrors(["RUNNER_UNAVAILABLE"]))
		.route({
			method: "POST",
			path: "/agent-runs/{id}/pause",
			summary:
				"Stop the process of a session or a ticket agent and keep its assignment, its conversation and its workspace. A resume continues the same conversation.",
		})
		.input(idInput)
		.output(AgentRunSchema),
	refresh: base
		.route({ method: "POST", path: "/agent-runs/{id}/refresh", summary: "Check an agent terminal" })
		.input(idInput)
		.output(AgentRunSchema),
};
