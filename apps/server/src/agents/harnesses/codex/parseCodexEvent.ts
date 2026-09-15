import { z } from "zod";
import type { HarnessEvent } from "../types.ts";

const nativeEvent = z.looseObject({
	hook_event_name: z.string(),
	session_id: z.string(),
	model: z.string().optional(),
	turn_id: z.string().optional(),
});

export function parseCodexEvent(payload: unknown): HarnessEvent[] {
	const event = nativeEvent.parse(payload);
	const identity = {
		sessionId: event.session_id,
		...(event.turn_id ? { turnId: event.turn_id } : {}),
		...(event.model ? { model: event.model } : {}),
	};
	switch (event.hook_event_name) {
		case "SessionStart":
			return [{ kind: "session", ...identity }];
		case "UserPromptSubmit":
			return [
				{
					kind: "prompt",
					sessionId: event.session_id,
					...(event.model ? { model: event.model } : {}),
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
		case "Interrupt":
			return [{ kind: "idle", outcome: "interrupted", ...identity }];
		case "PreToolUse":
		case "PostToolUse":
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
				},
			];
		default:
			return [];
	}
}
