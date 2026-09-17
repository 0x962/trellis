import { fromHarnessModel } from "@trellis/api/models";
import { z } from "zod";
import type { HarnessEvent } from "../types.ts";

const nativeEvent = z.looseObject({
	hook_event_name: z.string(),
	session_id: z.string(),
	model: z.string().optional(),
	prompt_id: z.string().optional(),
});

export function parseClaudeEvent(payload: unknown): HarnessEvent[] {
	const event = nativeEvent.parse(payload);
	const identity = {
		sessionId: event.session_id,
		...(event.prompt_id ? { turnId: event.prompt_id } : {}),
		...(event.model ? { model: fromHarnessModel("claude", event.model) } : {}),
	};
	switch (event.hook_event_name) {
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
