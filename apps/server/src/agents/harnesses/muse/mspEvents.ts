import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent } from "../types.ts";

const notification = z.object({ method: z.string(), params: z.record(z.string(), z.unknown()) });
const item = z.looseObject({
	itemId: z.string(),
	kind: z.string(),
	status: z.string(),
	turnId: z.string().nullish(),
	commandId: z.string().optional(),
	text: z.string().optional(),
	tool: z.string().optional(),
	args: z.string().optional(),
	visibleOutput: z.string().optional(),
	failureReason: z.string().optional(),
});
const failed = new Set(["failed", "cancelled", "rejected", "timedOut"]);

// The tool arguments of a Muse tool call item, as the model wrote them. Muse
// serializes them as one JSON string; a string that is not JSON stays text.
const toolInput = (args: string | undefined) => {
	if (args === undefined) return undefined;
	try {
		return JSON.parse(args);
	} catch {
		return args;
	}
};

// Maps the notifications of one Muse session to harness events. Every
// notification names its session, so a notification of another session on
// the same host maps to nothing.
//
// A user message item arrives as `item/completed` right after the turn
// starts, and it is the prompt receipt. A turn the bridge started with
// several held prompts carries them as one user message; the bridge
// registers the prompts under the command id of that turn, and the item
// yields one receipt per prompt. The text of the last completed agent
// message of a turn is the result of that turn.
export class MuseSessionEvents {
	private readonly answers = new Map<string, string>();
	private readonly prompts = new Set<string>();
	private readonly batches = new Map<string, string[]>();
	constructor(private readonly sessionId: string) {}
	expectBatch(commandId: string, prompts: string[]) {
		this.batches.set(commandId, prompts);
	}
	parse(payload: unknown): HarnessEvent[] {
		const { method, params } = notification.parse(payload);
		if (params.sessionId !== this.sessionId) return [];
		const identity = {
			sessionId: this.sessionId,
			...(typeof params.turnId === "string" ? { turnId: params.turnId } : {}),
		};
		if (method === "userInput/requested" || method === "userInput/request") {
			const request = z
				.looseObject({
					userInputId: z.string(),
					questions: z.array(
						z.looseObject({
							id: z.string(),
							question: z.string(),
							options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
							selection: z.object({
								mode: z.enum(["single", "multiple"]),
								minSelections: z.number().optional(),
								maxSelections: z.number().optional(),
							}),
						}),
					),
				})
				.parse(params);
			return [
				{
					kind: "input-request",
					...identity,
					inputRequest: {
						id: request.userInputId,
						kind: "question",
						title: "The agent has a question",
						blocking: true,
						questions: request.questions.map((question) => ({
							id: question.id,
							question: question.question,
							options: question.options,
							multiple: question.selection.mode === "multiple",
							minSelections: question.selection.minSelections,
							maxSelections: question.selection.maxSelections,
						})),
					},
				},
			];
		}
		if (method === "userInput/settled")
			return [{ kind: "input-resolved", ...identity, requestId: z.string().parse(params.userInputId) }];
		if (method === "session/modelChanged")
			return [{ kind: "session", ...identity, model: fromHarnessModel("muse", z.string().parse(params.modelId)) }];
		if (method === "turn/started") return [{ kind: "working", ...identity }];
		if (method === "turn/retryScheduled")
			return [{ kind: "error", ...identity, error: z.string().parse(params.reason), willRetry: true }];
		if (method === "turn/completed") {
			const turnId = z.string().parse(params.turnId);
			const terminal = z.string().parse(params.terminal);
			const result = this.answers.get(turnId);
			this.answers.delete(turnId);
			if (terminal === "failed") {
				const error = z.looseObject({ message: z.string() }).optional().parse(params.error);
				return [
					{
						kind: "error",
						...identity,
						outcome: "failed",
						willRetry: false,
						error: error?.message ?? (typeof params.reason === "string" ? params.reason : "The Muse turn failed."),
					},
				];
			}
			return [
				{
					kind: "idle",
					...identity,
					outcome: terminal === "cancelled" ? "interrupted" : "completed",
					...(result ? { result } : {}),
				},
			];
		}
		if (method === "item/started" || method === "item/updated" || method === "item/completed") {
			const value = item.parse(params.item);
			const turn = value.turnId ? { turnId: value.turnId } : {};
			if (value.kind === "userMessage") {
				if (this.prompts.has(value.itemId)) return [];
				this.prompts.add(value.itemId);
				const batch = value.commandId === undefined ? undefined : this.batches.get(value.commandId);
				if (value.commandId !== undefined) this.batches.delete(value.commandId);
				return (batch ?? [value.text ?? ""]).map((prompt) => ({
					kind: "prompt" as const,
					sessionId: this.sessionId,
					...turn,
					prompt,
				}));
			}
			if (value.kind === "agentMessage") {
				if (method !== "item/completed" || !value.text) return [];
				if (value.turnId) this.answers.set(value.turnId, value.text);
				return [{ kind: "message", ...identity, ...turn, message: { text: value.text } }];
			}
			if (value.kind === "toolCall") {
				const tool = {
					id: value.itemId,
					name: value.tool ?? "tool",
					...(value.args !== undefined ? { input: toolInput(value.args) } : {}),
					...(value.visibleOutput !== undefined ? { output: value.visibleOutput } : {}),
				};
				if (method === "item/started") return [{ kind: "tool-start", ...identity, ...turn, tool }];
				if (method === "item/updated") return [{ kind: "tool-update", ...identity, ...turn, tool }];
				return [
					{
						kind: "tool-end",
						...identity,
						...turn,
						tool,
						...(failed.has(value.status) ? { error: value.failureReason ?? value.status } : {}),
					},
				];
			}
		}
		return [];
	}
}
