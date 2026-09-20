import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent } from "../types.ts";

const nativeEvent = z.looseObject({
	hook_event_name: z.string(),
	session_id: z.string(),
	model: z.string().optional(),
	prompt_id: z.string().optional(),
});

const askUserQuestion = z.object({
	question: z.string(),
	options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
	multiSelect: z.boolean().default(false),
});

const askUserQuestionInput = z.object({
	questions: z.array(askUserQuestion).optional(),
});

function readQuestions(input: unknown) {
	const questions = askUserQuestionInput.parse(input ?? {}).questions;
	if (!questions?.length) return {};
	return {
		questions: questions.map((question, index) => ({
			id: String(index),
			question: question.question,
			options: question.options,
			multiple: question.multiSelect,
		})),
	};
}

export function parseClaudeEvent(payload: unknown): HarnessEvent[] {
	const event = nativeEvent.parse(payload);
	if (typeof event.agent_id === "string") return [];
	const identity = {
		sessionId: event.session_id,
		...(event.prompt_id ? { turnId: event.prompt_id } : {}),
		...(event.model ? { model: fromHarnessModel("claude", event.model) } : {}),
	};
	switch (event.hook_event_name) {
		case "PermissionRequest":
			if (event.tool_name === "AskUserQuestion") return [];
			return [
				{
					kind: "input-request",
					...identity,
					inputRequest: {
						id: `permission:${event.tool_use_id ?? event.tool_name}`,
						kind: "permission",
						title: `Approve ${event.tool_name}`,
						blocking: true,
					},
				},
			];
		case "Elicitation":
			return [
				{
					kind: "input-request",
					...identity,
					inputRequest: {
						id: `elicitation:${event.elicitation_id ?? event.mcp_server_name}`,
						kind: "elicitation",
						title: "The agent needs your response in the terminal",
						blocking: true,
					},
				},
			];
		case "ElicitationResult":
			return [
				{
					kind: "input-resolved",
					...identity,
					requestId: `elicitation:${event.elicitation_id ?? event.mcp_server_name}`,
				},
			];
		case "PostModelSwitch":
			return [{ kind: "session", ...identity, model: fromHarnessModel("claude", z.string().parse(event.to_model)) }];
		case "SessionStart":
			return [{ kind: "session", ...identity }];
		case "UserPromptSubmit":
			return [
				{
					kind: "prompt",
					sessionId: event.session_id,
					...(event.model ? { model: fromHarnessModel("claude", event.model) } : {}),
					prompt: z.string().parse(event.prompt),
				},
			];
		case "Stop":
			return [
				{
					kind: "idle",
					outcome: "completed",
					...identity,
					...(typeof event.last_assistant_message === "string" ? { result: event.last_assistant_message } : {}),
				},
			];
		case "StopFailure":
			return [
				{ kind: "error", outcome: "failed", ...identity, error: z.string().parse(event.error_details ?? event.error) },
			];
		case "PreToolUse":
		case "PostToolUse":
		case "PostToolUseFailure":
			return [
				...(event.hook_event_name === "PreToolUse"
					? event.tool_name === "AskUserQuestion"
						? [
								{
									kind: "input-request" as const,
									...identity,
									inputRequest: {
										id: z.string().parse(event.tool_use_id),
										kind: "question" as const,
										title: "The agent has a question in the terminal",
										blocking: true,
										...readQuestions(event.tool_input),
									},
								},
							]
						: []
					: [event.tool_use_id, `permission:${event.tool_use_id}`, `permission:${event.tool_name}`].map((id) => ({
							kind: "input-resolved" as const,
							...identity,
							requestId: z.string().parse(id),
						}))),
				{
					kind: event.hook_event_name === "PreToolUse" ? "tool-start" : "tool-end",
					...identity,
					tool: {
						id: z.string().parse(event.tool_use_id),
						name: z.string().parse(event.tool_name),
						...(event.tool_input !== undefined ? { input: event.tool_input } : {}),
						...(event.tool_response !== undefined ? { output: event.tool_response } : {}),
					},
					...(event.hook_event_name === "PostToolUseFailure" ? { error: z.string().parse(event.error) } : {}),
				},
			];
		default:
			return [];
	}
}
