import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent } from "../types.ts";

const notification = z.object({ method: z.string(), params: z.record(z.string(), z.unknown()) });
const compactionLog = z.object({
	target: z.literal("codex_api::sse::responses"),
	fields: z.object({ message: z.literal('unhandled responses event: "response.compaction.compacting"') }),
	spans: z.array(
		z.looseObject({ name: z.string(), "thread.id": z.string().optional(), "turn.id": z.string().optional() }),
	),
});
const itemSchema = z.looseObject({ id: z.string(), type: z.string() });
const tools = new Set([
	"commandExecution",
	"fileChange",
	"mcpToolCall",
	"dynamicToolCall",
	"webSearch",
	"imageView",
	"imageGeneration",
	"collabAgentToolCall",
	"contextCompaction",
]);
export class CodexAppServerEvents {
	private readonly answers = new Map<string, Map<string, string>>();
	private compactionId: string | null = null;
	private progressTurnId: string | null = null;
	private readonly prompts = new Set<string>();
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
				tool: { id: this.compactionId ?? `compaction:${this.progressTurnId}`, name: "contextCompaction" },
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
			if (item.type === "agentMessage" && method === "item/completed")
				return [{ kind: "message", ...identity, message: { text: z.string().parse(item.text) } }];
			if (tools.has(item.type))
				return [
					{
						kind: method === "item/started" ? "tool-start" : "tool-end",
						...identity,
						tool: { id: item.id, name: item.type, ...(method === "item/started" ? { input: item } : { output: item }) },
					},
				];
		}
		if (method === "item/commandExecution/outputDelta")
			return [
				{
					kind: "tool-update",
					...identity,
					tool: {
						id: z.string().parse(params.itemId),
						name: "commandExecution",
						output: z.string().parse(params.delta),
					},
				},
			];
		return [];
	}
}
