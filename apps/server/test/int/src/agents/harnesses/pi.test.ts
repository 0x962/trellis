import { expect, test } from "bun:test";
import { parsePiEvent } from "../../../../../src/agents/harnesses/pi/pi.ts";

test("Pi preserves native identity, receipts, tools and turn completion", () => {
	const base = { sessionId: "vendor-id", model: "provider/model" };
	expect(parsePiEvent({ ...base, event: "session_start", payload: {} })).toEqual([{ kind: "session", ...base }]);
	expect(parsePiEvent({ ...base, event: "input", payload: { text: "trellis-message:123\nhello" } })).toEqual([
		{ kind: "prompt", ...base, prompt: "trellis-message:123\nhello" },
	]);
	expect(parsePiEvent({ ...base, event: "agent_start", payload: {} })).toEqual([{ kind: "working", ...base }]);
	expect(
		parsePiEvent({
			...base,
			event: "tool_execution_start",
			payload: { toolCallId: "tool1", toolName: "bash", args: { command: "pwd" } },
		}),
	).toEqual([{ kind: "tool-start", ...base, tool: { id: "tool1", name: "bash", input: { command: "pwd" } } }]);
	expect(
		parsePiEvent({
			...base,
			event: "agent_end",
			payload: { messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" }] },
		}),
	).toEqual([{ kind: "idle", ...base, result: "done" }]);
});

test("Pi distinguishes provider errors and aborted turns from successful output", () => {
	expect(
		parsePiEvent({
			event: "agent_end",
			payload: { messages: [{ role: "assistant", stopReason: "error", errorMessage: "quota" }] },
		}),
	).toEqual([{ kind: "error", error: "quota" }, { kind: "idle" }]);
	expect(
		parsePiEvent({
			event: "agent_end",
			payload: {
				messages: [{ role: "assistant", stopReason: "aborted", content: [{ type: "text", text: "partial" }] }],
			},
		}),
	).toEqual([{ kind: "idle" }]);
});
