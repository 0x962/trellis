import { expect, test } from "bun:test";
import { CodexAppServerEvents } from "./appServerEvents.ts";

function progress(threadId = "s", turnId = "t") {
	return {
		target: "codex_api::sse::responses",
		fields: { message: 'unhandled responses event: "response.compaction.compacting"' },
		spans: [{ name: "turn", "thread.id": threadId, "turn.id": turnId }],
	};
}

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

test("Codex compaction start, provider progress, and completion count as work", () => {
	const events = new CodexAppServerEvents("s");
	const params = { threadId: "s", turnId: "t", item: { id: "compact-1", type: "contextCompaction" } };
	expect(events.parse({ method: "item/started", params })).toEqual([
		{
			kind: "tool-start",
			sessionId: "s",
			turnId: "t",
			tool: { id: "compact-1", name: "contextCompaction", input: params.item },
		},
	]);
	expect(events.compactionProgress(progress())).toEqual([
		{ kind: "tool-update", sessionId: "s", turnId: "t", tool: { id: "compact-1", name: "contextCompaction" } },
	]);
	expect(events.compactionProgress("connection alive")).toEqual([]);
	expect(events.parse({ method: "item/completed", params })[0]?.kind).toBe("tool-end");
	expect(events.compactionProgress(progress())).toEqual([]);
});

test("pre-turn compaction progress requires the current provider thread and turn", () => {
	const events = new CodexAppServerEvents("s");
	events.parse({ method: "turn/started", params: { threadId: "s", turn: { id: "t" } } });
	const line = progress();
	expect(events.compactionProgress(line)[0]).toMatchObject({
		kind: "tool-update",
		tool: { id: "compaction:t", name: "contextCompaction" },
	});
	expect(events.compactionProgress(progress("child"))).toEqual([]);
	expect(events.compactionProgress(progress("s-other"))).toEqual([]);
	expect(
		events.compactionProgress({
			target: "codex_api::sse::responses",
			fields: { message: 'unhandled responses event: "response.compaction.compacting"' },
		}),
	).toEqual([]);
	expect(events.compactionProgress(progress("s", "old"))).toEqual([]);
	events.parse({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
	expect(events.compactionProgress(line)).toEqual([]);
});
