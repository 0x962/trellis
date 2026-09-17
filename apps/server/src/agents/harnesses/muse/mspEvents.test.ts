import { expect, test } from "bun:test";
import { MuseSessionEvents } from "./mspEvents.ts";

const sessionId = "01a0ac27-a5a9-728c-bf93-9254b04c110f";
const turnId = "01a0ac27-a632-70d8-8185-dc56e673d85c";
const notify = (method: string, params: Record<string, unknown>) => ({ method, params: { sessionId, ...params } });

test("Muse notifications map to prompt receipts, tools, messages, and the turn result", () => {
	const events = new MuseSessionEvents(sessionId);
	expect(events.parse(notify("turn/started", { turnId }))).toEqual([{ kind: "working", sessionId, turnId }]);
	const user = { itemId: "u1", kind: "userMessage", status: "completed", turnId, text: "trellis-message:id\nhello" };
	expect(events.parse(notify("item/completed", { item: user }))).toEqual([
		{ kind: "prompt", sessionId, turnId, prompt: "trellis-message:id\nhello" },
	]);
	expect(events.parse(notify("item/started", { item: user }))).toEqual([]);
	const tool = {
		itemId: "t1",
		kind: "toolCall",
		status: "inProgress",
		turnId,
		tool: "bash",
		args: '{"command":"pwd"}',
	};
	expect(events.parse(notify("item/started", { item: tool }))).toEqual([
		{ kind: "tool-start", sessionId, turnId, tool: { id: "t1", name: "bash", input: { command: "pwd" } } },
	]);
	expect(
		events.parse(notify("item/completed", { item: { ...tool, status: "completed", visibleOutput: "/tmp" } })),
	).toEqual([
		{
			kind: "tool-end",
			sessionId,
			turnId,
			tool: { id: "t1", name: "bash", input: { command: "pwd" }, output: "/tmp" },
		},
	]);
	expect(
		events.parse(
			notify("item/completed", {
				item: { itemId: "a1", kind: "agentMessage", status: "completed", turnId, text: "ok" },
			}),
		),
	).toEqual([{ kind: "message", sessionId, turnId, message: { text: "ok" } }]);
	expect(events.parse(notify("turn/completed", { turnId, terminal: "completed" }))).toEqual([
		{ kind: "idle", sessionId, turnId, outcome: "completed", result: "ok" },
	]);
});

test("Muse reports interrupted, failed, and retried turns without a result", () => {
	const events = new MuseSessionEvents(sessionId);
	expect(events.parse(notify("turn/completed", { turnId, terminal: "cancelled" }))).toEqual([
		{ kind: "idle", sessionId, turnId, outcome: "interrupted" },
	]);
	expect(
		events.parse(
			notify("turn/completed", {
				turnId,
				terminal: "failed",
				error: { kind: "provider", message: "quota", retryable: false },
			}),
		),
	).toEqual([{ kind: "error", sessionId, turnId, outcome: "failed", willRetry: false, error: "quota" }]);
	expect(events.parse(notify("turn/retryScheduled", { turnId, reason: "HTTP 503", attempt: 1 }))).toEqual([
		{ kind: "error", sessionId, turnId, error: "HTTP 503", willRetry: true },
	]);
	expect(
		events.parse(
			notify("item/completed", {
				item: { itemId: "t2", kind: "toolCall", status: "failed", turnId, tool: "bash", failureReason: "exit 1" },
			}),
		),
	).toEqual([{ kind: "tool-end", sessionId, turnId, tool: { id: "t2", name: "bash" }, error: "exit 1" }]);
});

test("a turn that carries several held prompts yields one receipt per prompt", () => {
	const events = new MuseSessionEvents(sessionId);
	events.expectBatch("cmd-1", ["trellis-message:a\nfirst", "trellis-message:b\nsecond"]);
	const item = {
		itemId: "u2",
		kind: "userMessage",
		status: "completed",
		turnId,
		commandId: "cmd-1",
		text: "trellis-message:a\nfirst\n\ntrellis-message:b\nsecond",
	};
	expect(events.parse(notify("item/completed", { item }))).toEqual([
		{ kind: "prompt", sessionId, turnId, prompt: "trellis-message:a\nfirst" },
		{ kind: "prompt", sessionId, turnId, prompt: "trellis-message:b\nsecond" },
	]);
	expect(events.parse(notify("item/started", { item }))).toEqual([]);
	const own = { itemId: "u3", kind: "userMessage", status: "completed", turnId, commandId: "cmd-2", text: "typed" };
	expect(events.parse(notify("item/completed", { item: own }))).toEqual([
		{ kind: "prompt", sessionId, turnId, prompt: "typed" },
	]);
});

test("Muse ignores other sessions, reasoning items, and reports model changes", () => {
	const events = new MuseSessionEvents(sessionId);
	expect(events.parse({ method: "turn/started", params: { sessionId: "other", turnId } })).toEqual([]);
	expect(
		events.parse(notify("item/started", { item: { itemId: "r1", kind: "reasoning", status: "inProgress", turnId } })),
	).toEqual([]);
	expect(events.parse(notify("session/modelChanged", { modelId: "muse-spark-1.2", source: "user" }))).toEqual([
		{ kind: "session", sessionId, model: "meta/muse-spark-1.2" },
	]);
});
