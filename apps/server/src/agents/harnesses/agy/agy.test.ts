import { expect, test } from "bun:test";
import { parseAgyEvent } from "./agy.ts";

const payload = { conversationId: "conversation-1", modelName: "model-1" };
test("AGY binds receipts only to structured explicit user messages", () => {
	expect(
		parseAgyEvent({
			event: "PreInvocation",
			payload,
			transcript: [
				{
					source: "USER_EXPLICIT",
					type: "USER_INPUT",
					content: "<USER_REQUEST>\ntrellis-message:abc\nhello\n</USER_REQUEST>\n<META>x</META>",
				},
				{ source: "MODEL", type: "PLANNER_RESPONSE", content: "not a receipt" },
			],
		}),
	).toEqual([
		{ kind: "session", sessionId: "conversation-1", model: "model-1" },
		{ kind: "prompt", sessionId: "conversation-1", model: "model-1", prompt: "trellis-message:abc\nhello" },
		{ kind: "working", sessionId: "conversation-1", model: "model-1" },
	]);
});
test("AGY requires fullyIdle and ignores non-tool PostToolUse events", () => {
	expect(parseAgyEvent({ event: "PostToolUse", payload: { ...payload, toolCall: null } })).toEqual([]);
	expect(parseAgyEvent({ event: "Stop", payload: { ...payload, fullyIdle: false } })).toEqual([]);
	expect(
		parseAgyEvent({
			event: "Stop",
			payload: { ...payload, fullyIdle: true },
			transcript: [{ source: "MODEL", type: "PLANNER_RESPONSE", content: "done" }],
		}),
	).toEqual([{ kind: "idle", sessionId: "conversation-1", model: "model-1", result: "done" }]);
});
test("AGY missing Stop after interruption never produces inferred idle", () => {
	expect(parseAgyEvent({ event: "PostInvocation", payload })).toEqual([]);
});

test("AGY does not reuse a result from a previous prompt", () => {
	expect(
		parseAgyEvent({
			event: "Stop",
			payload: { ...payload, fullyIdle: true },
			transcript: [
				{ source: "MODEL", type: "PLANNER_RESPONSE", content: "old result" },
				{ source: "USER_EXPLICIT", type: "USER_INPUT", content: "new prompt" },
			],
		}),
	).toEqual([{ kind: "idle", sessionId: "conversation-1", model: "model-1" }]);
});
