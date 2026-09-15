import { z } from "zod";
import { pickErrors } from "../errors.ts";
import { AgentRunListInputSchema, AgentRunSchema, AgentRunStartInputSchema } from "../schemas/agentRun.ts";
import { UlidSchema } from "../schemas/primitives.ts";
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
});
const harnessSchema = z.object({
	state: z.enum(["ready", "working", "idle", "needs_input", "failed", "unknown"]),
	sessionId: z.string(),
	acknowledgedMessageIds: z.array(z.string()),
	resultTruncated: z.boolean().optional(),
	transcriptTruncated: z.boolean().optional(),
	result: z.string().nullable(),
	error: z.string().nullable(),
	transcript: z.array(
		z.object({ role: z.enum(["user", "assistant"]), text: z.string(), messageId: z.string().optional() }),
	),
	pendingPermissions: z.array(
		z.object({
			requestId: z.string(),
			toolName: z.string(),
			toolUseId: z.string().nullable(),
			input: z.record(z.string(), z.unknown()),
		}),
	),
});
export const agentRuns = {
	harness: base
		.route({ method: "GET", path: "/agent-runs/{id}/harness", summary: "Read agent turn state" })
		.input(idInput)
		.output(harnessSchema.nullable()),
	permission: base
		.route({ method: "POST", path: "/agent-runs/{id}/permission", summary: "Decide a tool permission request" })
		.input(idInput.extend({ requestId: z.string().min(1), behavior: z.enum(["allow", "deny"]) }))
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
		.input(idInput.extend({ text: z.string().min(1).max(65536), expectedTerminalId: z.string().optional() }))
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
		.route({ method: "POST", path: "/agent-runs/{id}/send", summary: "Send an agent a follow-up" })
		.input(idInput.extend({ text: z.string().trim().min(1).max(20000) }))
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
	start: base
		.route({ method: "POST", path: "/agent-runs", successStatus: 201, summary: "Start an agent from a persona" })
		.input(AgentRunStartInputSchema)
		.output(AgentRunSchema),
	stop: base
		.route({ method: "POST", path: "/agent-runs/{id}/stop", summary: "Stop an agent" })
		.input(idInput)
		.output(AgentRunSchema),
	refresh: base
		.route({ method: "POST", path: "/agent-runs/{id}/refresh", summary: "Check an agent terminal" })
		.input(idInput)
		.output(AgentRunSchema),
};
