import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent } from "../types.ts";

const notification = z.object({ method: z.string(), params: z.record(z.string(), z.unknown()) });
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
]);
export class CodexAppServerEvents {
	private readonly answers = new Map<string, Map<string, string>>();
	private readonly prompts = new Set<string>();
	constructor(private readonly sessionId: string) {}
	parse(payload: unknown): HarnessEvent[] {
		const { method, params } = notification.parse(payload);
		if (params.threadId !== this.sessionId) return [];
		const identity = {
			sessionId: this.sessionId,
			...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
		};
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
		if (method === "turn/started") {
			const turn = z.looseObject({ id: z.string() }).parse(params.turn);
			return [{ kind: "working", ...identity, turnId: turn.id }];
		}
		if (method === "error") {
			const error = z.looseObject({ message: z.string() }).parse(params.error);
			return [{ kind: "error", ...identity, error: error.message, willRetry: z.boolean().parse(params.willRetry) }];
		}
		if (method === "turn/completed") {
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
