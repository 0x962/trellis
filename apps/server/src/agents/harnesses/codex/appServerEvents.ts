import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent } from "../types.ts";
import { codexTool, codexToolTypes } from "./codexTool/index.ts";

const notification = z.object({ method: z.string(), params: z.record(z.string(), z.unknown()) });
const compactionLog = z.object({
	target: z.literal("codex_api::sse::responses"),
	fields: z.object({ message: z.literal('unhandled responses event: "response.compaction.compacting"') }),
	spans: z.array(
		z.looseObject({ name: z.string(), "thread.id": z.string().optional(), "turn.id": z.string().optional() }),
	),
});
const itemSchema = z.looseObject({ id: z.string(), type: z.string() });
const itemUpdate = z.looseObject({ turnId: z.string(), itemId: z.string() });
// A sentence end, or a line end, in the text of an agent message.
const sentenceEnd = /[.!?:]\s|\n/;
export class CodexAppServerEvents {
	private readonly answers = new Map<string, Map<string, string>>();
	private compactionId: string | null = null;
	private progressTurnId: string | null = null;
	private readonly prompts = new Set<string>();
	private planUpdates = 0;
	// The name of each tool that started in the current turn, by item id. An
	// update event must carry the name, and an update for a tool that did not
	// start in this turn has nothing to show.
	private readonly toolNames = new Map<string, string>();
	// Each agent message that Codex streams, by item id: the text so far, and
	// the first sentence once the parser sent it.
	private readonly streams = new Map<string, { text: string; sent: string | null }>();
	constructor(private readonly sessionId: string) {}
	compactionProgress(payload: unknown): HarnessEvent[] {
		if (this.progressTurnId === null) return [];
		const entry = compactionLog.safeParse(payload);
		if (
			!entry.success ||
			!entry.data.spans.some(
				(span) =>
					span.name === "turn" && span["thread.id"] === this.sessionId && span["turn.id"] === this.progressTurnId,
			)
		)
			return [];
		return [
			{
				kind: "tool-update",
				sessionId: this.sessionId,
				turnId: this.progressTurnId,
				tool: { id: this.compactionId ?? `compaction:${this.progressTurnId}`, name: "Compact" },
			},
		];
	}
	parseRequest(request: { id: string | number; method: string; params?: unknown }): HarnessEvent[] {
		if (request.method !== "item/tool/requestUserInput") return [];
		const params = z
			.looseObject({ threadId: z.string(), turnId: z.string(), isBlocking: z.boolean() })
			.parse(request.params);
		if (params.threadId !== this.sessionId || params.isBlocking) return [];
		return [
			{
				kind: "input-request",
				sessionId: params.threadId,
				turnId: params.turnId,
				inputRequest: {
					id: `codex:request:${request.id}`,
					kind: "question",
					title: "Answer the question in the terminal",
					blocking: false,
				},
			},
		];
	}
	parse(payload: unknown): HarnessEvent[] {
		const { method, params } = notification.parse(payload);
		if (params.threadId !== this.sessionId) return [];
		const identity = {
			sessionId: this.sessionId,
			...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
		};
		if (method === "thread/status/changed") {
			const status = z
				.looseObject({ type: z.string(), activeFlags: z.array(z.string()).optional() })
				.parse(params.status);
			return ["waitingOnUserInput", "waitingOnApproval"].map(
				(flag): HarnessEvent =>
					status.activeFlags?.includes(flag)
						? {
								kind: "input-request",
								...identity,
								inputRequest: {
									id: `codex:${flag}`,
									kind: flag === "waitingOnApproval" ? "permission" : "question",
									title:
										flag === "waitingOnApproval"
											? "Approve the request in the terminal"
											: "Answer the question in the terminal",
									blocking: true,
								},
							}
						: { kind: "input-resolved", ...identity, requestId: `codex:${flag}` },
			);
		}
		if (method === "serverRequest/resolved")
			return [{ kind: "input-resolved", ...identity, requestId: `codex:request:${params.requestId}` }];
		if (method === "thread/settings/updated")
			return [
				{
					kind: "session",
					...identity,
					model: fromHarnessModel("codex", z.looseObject({ model: z.string() }).parse(params.threadSettings).model),
				},
			];
		if (method === "model/rerouted")
			return [{ kind: "session", ...identity, model: fromHarnessModel("codex", z.string().parse(params.toModel)) }];
		if (method === "thread/tokenUsage/updated") {
			const tokenUsage = z
				.looseObject({ total: z.looseObject({ totalTokens: z.number().int().nonnegative() }) })
				.parse(params.tokenUsage);
			return [{ kind: "session", ...identity, tokenUsage: { totalTokens: tokenUsage.total.totalTokens } }];
		}
		if (method === "turn/started") {
			const turn = z.looseObject({ id: z.string() }).parse(params.turn);
			this.progressTurnId = turn.id;
			this.compactionId = null;
			return [{ kind: "working", ...identity, turnId: turn.id }];
		}
		if (method === "error") {
			const error = z.looseObject({ message: z.string() }).parse(params.error);
			return [{ kind: "error", ...identity, error: error.message, willRetry: z.boolean().parse(params.willRetry) }];
		}
		if (method === "turn/completed") {
			this.progressTurnId = null;
			this.compactionId = null;
			this.streams.clear();
			this.toolNames.clear();
			const turn = z
				.looseObject({
					id: z.string(),
					status: z.enum(["completed", "interrupted", "failed"]),
					error: z.looseObject({ message: z.string() }).nullish(),
				})
				.parse(params.turn);
			const result = [...(this.answers.get(turn.id)?.values() ?? [])].join("\n\n");
			this.answers.delete(turn.id);
			if (turn.status === "failed")
				return [
					{
						kind: "error",
						...identity,
						turnId: turn.id,
						outcome: "failed",
						willRetry: false,
						error: z.string().parse(turn.error?.message),
					},
				];
			return [{ kind: "idle", ...identity, turnId: turn.id, outcome: turn.status, ...(result ? { result } : {}) }];
		}
		if (method === "item/started" || method === "item/completed") {
			const item = itemSchema.parse(params.item);
			if (item.type === "contextCompaction") {
				this.progressTurnId = method === "item/started" ? z.string().parse(params.turnId) : null;
				this.compactionId = this.progressTurnId === null ? null : item.id;
			}
			if (item.type === "userMessage") {
				if (this.prompts.has(item.id)) return [];
				this.prompts.add(item.id);
				const content = z.array(z.looseObject({ type: z.string(), text: z.string().optional() })).parse(item.content);
				return [
					{
						kind: "prompt",
						...identity,
						prompt: content
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n"),
					},
				];
			}
			if (item.type === "agentMessage" && item.phase === "final_answer" && method === "item/completed") {
				const turnId = z.string().parse(params.turnId);
				const answers = this.answers.get(turnId) ?? new Map<string, string>();
				answers.set(item.id, z.string().parse(item.text));
				this.answers.set(turnId, answers);
			}
			if (item.type === "agentMessage" && method === "item/completed") {
				const text = z.string().parse(item.text);
				const sent = this.streams.get(item.id)?.sent;
				this.streams.delete(item.id);
				if (sent === text.trim()) return [];
				return [{ kind: "message", ...identity, message: { text } }];
			}
			if (codexToolTypes.has(item.type)) {
				const tool = codexTool(item);
				if (method === "item/started") this.toolNames.set(item.id, tool.name);
				return [
					method === "item/started"
						? { kind: "tool-start", ...identity, tool: { id: item.id, name: tool.name, input: tool.input } }
						: { kind: "tool-end", ...identity, tool: { id: item.id, name: tool.name, output: item } },
				];
			}
		}
		// Codex streams an agent message in small pieces. Each message event
		// sends the whole run to every open page, and the agent line shows one
		// line of text, so the parser sends the first sentence once it is
		// complete, and the whole message at item/completed when it holds more.
		if (method === "item/agentMessage/delta") {
			const { itemId } = itemUpdate.parse(params);
			const stream = this.streams.get(itemId) ?? { text: "", sent: null };
			this.streams.set(itemId, stream);
			if (stream.sent !== null) return [];
			stream.text += z.string().parse(params.delta);
			const text = stream.text.trimStart();
			const end = sentenceEnd.exec(text);
			if (end === null) return [];
			stream.sent = text.slice(0, end.index + 1).trim();
			return [{ kind: "message", ...identity, message: { text: stream.sent } }];
		}
		// A plan update is the update_plan tool call of Codex. It starts and
		// ends at once, and its target is the step in progress.
		if (method === "turn/plan/updated") {
			const plan = z
				.looseObject({
					explanation: z.string().nullable(),
					plan: z.array(z.looseObject({ step: z.string(), status: z.string() })),
				})
				.parse(params);
			const step = plan.plan.find((entry) => entry.status === "inProgress")?.step;
			const tool = { id: `plan:${params.turnId}:${++this.planUpdates}`, name: "Plan" };
			return [
				{ kind: "tool-start", ...identity, tool: { ...tool, input: { description: step ?? plan.explanation ?? "" } } },
				{ kind: "tool-end", ...identity, tool: { ...tool, output: plan } },
			];
		}
		if (method === "item/fileChange/patchUpdated") {
			const { itemId } = itemUpdate.parse(params);
			return [
				{ kind: "tool-update", ...identity, tool: { id: itemId, ...codexTool({ type: "fileChange", ...params }) } },
			];
		}
		// Each of these reports progress of a running tool: the output of a
		// command, the text a command reads from the model, the progress
		// message of an MCP tool.
		const progress = {
			"item/commandExecution/outputDelta": "delta",
			"item/commandExecution/terminalInteraction": "stdin",
			"item/mcpToolCall/progress": "message",
		}[method];
		if (progress !== undefined) {
			const { itemId } = itemUpdate.parse(params);
			const name = this.toolNames.get(itemId);
			if (name === undefined) return [];
			return [
				{ kind: "tool-update", ...identity, tool: { id: itemId, name, output: z.string().parse(params[progress]) } },
			];
		}
		return [];
	}
}
