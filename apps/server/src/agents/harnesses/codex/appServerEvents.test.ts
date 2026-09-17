import { expect, test } from "bun:test";
import { CodexAppServerEvents } from "./appServerEvents.ts";

test("Codex reports an assistant message before the turn completes", () => {
	const events = new CodexAppServerEvents("s");
	expect(
		events.parse({
			method: "item/completed",
			params: {
				threadId: "s",
				turnId: "t",
				item: { type: "agentMessage", id: "a", phase: "commentary", text: "I will run the tests." },
			},
		}),
	).toEqual([{ kind: "message", sessionId: "s", turnId: "t", message: { text: "I will run the tests." } }]);
});

test("Codex maps exact native prompt, hosted tool, response, and failure identities", () => {
	const events = new CodexAppServerEvents("s");
	expect(
		events.parse({
			method: "item/started",
			params: {
				threadId: "s",
				turnId: "t",
				item: { type: "userMessage", id: "u", content: [{ type: "text", text: "trellis-message:m\nhello" }] },
			},
		}),
	).toEqual([{ kind: "prompt", sessionId: "s", turnId: "t", prompt: "trellis-message:m\nhello" }]);
	expect(
		events.parse({
			method: "item/started",
			params: { threadId: "s", turnId: "t", item: { type: "webSearch", id: "w", query: "native tools" } },
		})[0],
	).toMatchObject({ kind: "tool-start", tool: { id: "w", name: "webSearch" } });
	expect(
		events.parse({
			method: "error",
			params: { threadId: "s", turnId: "t", error: { message: "rate limited" }, willRetry: true },
		})[0],
	).toMatchObject({ kind: "error", error: "rate limited", willRetry: true });
	events.parse({
		method: "item/completed",
		params: {
			threadId: "s",
			turnId: "t",
			item: { type: "agentMessage", id: "a", phase: "final_answer", text: "complete response" },
		},
	});
	expect(
		events.parse({
			method: "turn/completed",
			params: { threadId: "s", turn: { id: "t", status: "completed", items: [] } },
		}),
	).toEqual([{ kind: "idle", sessionId: "s", turnId: "t", outcome: "completed", result: "complete response" }]);
});

test("Codex ignores another thread and preserves final errors and interruption", () => {
	const events = new CodexAppServerEvents("s");
	expect(
		events.parse({
			method: "error",
			params: { threadId: "child", turnId: "t", error: { message: "child failed" }, willRetry: false },
		}),
	).toEqual([]);
	expect(
		events.parse({
			method: "turn/completed",
			params: {
				threadId: "s",
				turn: { id: "t", status: "failed", error: { message: "invalid credentials" }, items: [] },
			},
		})[0],
	).toMatchObject({ kind: "error", outcome: "failed", error: "invalid credentials", willRetry: false });
	expect(
		events.parse({
			method: "turn/completed",
			params: { threadId: "s", turn: { id: "t2", status: "interrupted", items: [] } },
		})[0],
	).toMatchObject({ kind: "idle", turnId: "t2", outcome: "interrupted" });
});

test("Codex keeps commentary out of the final result", () => {
	const events = new CodexAppServerEvents("s");
	for (const [id, phase, text] of [
		["c", "commentary", "I will inspect the condition."],
		["u", null, "unclassified text"],
		["f", "final_answer", "YES"],
	]) {
		events.parse({
			method: "item/completed",
			params: { threadId: "s", turnId: "t", item: { type: "agentMessage", id, phase, text } },
		});
	}
	expect(
		events.parse({
			method: "turn/completed",
			params: { threadId: "s", turn: { id: "t", status: "completed", items: [] } },
		})[0]?.result,
	).toBe("YES");
});

test("Codex tracks native model changes without a new turn", () => {
	const events = new CodexAppServerEvents("s");
	expect(
		events.parse({
			method: "thread/settings/updated",
			params: { threadId: "s", threadSettings: { model: "selected-model" } },
		}),
	).toEqual([{ kind: "session", sessionId: "s", model: "openai/selected-model" }]);
	expect(
		events.parse({
			method: "model/rerouted",
			params: { threadId: "s", turnId: "t", fromModel: "selected-model", toModel: "effective-model" },
		}),
	).toEqual([{ kind: "session", sessionId: "s", turnId: "t", model: "openai/effective-model" }]);
});
