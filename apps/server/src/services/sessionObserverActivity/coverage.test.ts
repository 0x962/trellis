import { expect, test } from "bun:test";
import { CompletedActivity } from "../../../../runtime/src/harnessObservations/components/completedActivity/index.ts";
import { parseClaudeEvent } from "../../agents/harnesses/claude/parseClaudeEvent.ts";
import { CodexAppServerEvents } from "../../agents/harnesses/codex/appServerEvents.ts";
import { MuseSessionEvents } from "../../agents/harnesses/muse/mspEvents.ts";
import { readSessionObserverActivity } from "./sessionObserverActivity.ts";
import { annotated, fixture, line, outputReader } from "./testFixture/index.ts";

test("Codex same-turn status cycles emit new input signals after a saved cursor", async () => {
	const f = await fixture();
	const observedAt = f.at.toISOString();
	const parser = new CodexAppServerEvents("thread");
	const status = (activeFlags: string[]) =>
		parser.parse({
			method: "thread/status/changed",
			params: { threadId: "thread", status: { type: "active", activeFlags } },
		});
	const modern = new CompletedActivity();
	const start = { kind: "working" as const, turnId: "turn" };
	modern.derive(start, observedAt);
	const firstEvents = status(["waitingOnUserInput"]);
	const firstSignals = firstEvents.flatMap((event) => {
		const result = modern.derive(event, observedAt);
		return result.signal === undefined ? [] : [result.signal];
	});
	const records = [start, ...firstEvents].map((event) => line({ observedAt, event }));
	const logs = new Map([
		[f.attempts[0]!, Buffer.alloc(0)],
		[f.attempts[1]!, Buffer.concat(records)],
	]);
	const reader = outputReader(logs);
	const first = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, reader);
	expect(first.signals.map((signal) => signal.id)).toEqual(firstSignals.map((signal) => signal.id));
	const nextEvents = [...firstEvents, ...status([]), ...status([]), ...status(["waitingOnUserInput"]), ...firstEvents];
	const nextSignals = nextEvents.flatMap((event) => {
		const result = modern.derive(event, observedAt);
		return result.signal === undefined ? [] : [result.signal];
	});
	logs.set(f.attempts[1]!, Buffer.concat([...records, ...nextEvents.map((event) => line({ observedAt, event }))]));
	const next = await readSessionObserverActivity(f.context, { runId: f.runId, after: first.cursor }, reader);
	expect(firstSignals).toHaveLength(1);
	expect(nextSignals).toHaveLength(1);
	expect(next.signals.map((signal) => signal.id)).toEqual(nextSignals.map((signal) => signal.id));
	expect(nextSignals[0]!.id).not.toBe(firstSignals[0]!.id);
	const repeat = await readSessionObserverActivity(f.context, { runId: f.runId, after: next.cursor }, reader);
	expect(repeat.signals).toEqual([]);
});

test("a Muse batch preserves both prompts once in modern and legacy activity", async () => {
	const f = await fixture();
	const observedAt = f.at.toISOString();
	const parser = new MuseSessionEvents("session");
	parser.expectBatch("command", ["First prompt.", "Second prompt."]);
	const notification = {
		method: "item/completed",
		params: {
			sessionId: "session",
			item: { itemId: "batch", commandId: "command", turnId: "turn", kind: "userMessage", status: "completed" },
		},
	};
	const events = parser.parse(notification);
	expect(events.map((event) => event.activityId)).toEqual(["batch:prompt:0", "batch:prompt:1"]);
	expect(parser.parse(notification)).toEqual([]);
	const modern = new CompletedActivity();
	const items = [...events, ...events].flatMap((event) => {
		const result = modern.derive(event, observedAt);
		return result.activity === undefined ? [] : [result.activity];
	});
	expect(items).toMatchObject([{ text: "First prompt." }, { text: "Second prompt." }]);
	expect(items).toHaveLength(2);
	const logs = new Map([
		[f.attempts[0]!, Buffer.alloc(0)],
		[f.attempts[1]!, Buffer.concat([...events, ...events].map((event) => line({ observedAt, event })))],
	]);
	const legacy = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, outputReader(logs));
	expect(legacy.items.map(({ attemptId, attemptGeneration, ...item }) => item)).toEqual(items);
	const repeat = await readSessionObserverActivity(
		f.context,
		{ runId: f.runId, after: legacy.cursor },
		outputReader(logs),
	);
	expect(repeat.items).toEqual([]);
});

test("an older runtime journal preserves explicit message completion and result identities", async () => {
	const f = await fixture();
	const observedAt = f.at.toISOString();
	const records = ["first", "second", "first"].map((id) =>
		line({
			observedAt,
			event: {
				kind: "message",
				turnId: "turn",
				message: { id, text: id, complete: true },
			},
		}),
	);
	records.push(
		line({
			observedAt,
			event: {
				kind: "idle",
				turnId: "turn",
				outcome: "completed",
				result: "first\n\nsecond",
				resultActivityIds: ["first", "second"],
			},
		}),
	);
	const logs = new Map([
		[f.attempts[0]!, Buffer.alloc(0)],
		[f.attempts[1]!, Buffer.concat(records)],
	]);
	const result = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, outputReader(logs));
	expect(result.items).toMatchObject([
		{ id: "assistant:first", text: "first" },
		{ id: "assistant:second", text: "second" },
	]);
	expect(result.items).toHaveLength(2);
	expect(result.context).toEqual([]);
	expect(result.signals).toMatchObject([{ kind: "completion", messageAvailability: "complete" }]);
});

test("20 completed Claude tools reach the threshold with unproven message context", async () => {
	const f = await fixture();
	const observedAt = f.at.toISOString();
	const records = [line({ observedAt, event: { kind: "message", message: { text: "I will inspect the files." } } })];
	for (let index = 0; index < 20; index++) {
		for (const hook_event_name of ["PreToolUse", "PostToolUse"]) {
			const events = parseClaudeEvent({
				hook_event_name,
				session_id: "claude-worker",
				tool_use_id: `tool-${index}`,
				tool_name: "Bash",
				tool_input: { command: `read ${index}` },
				tool_response: `result ${index}`,
			});
			records.push(...events.map((event) => line({ observedAt, event })));
		}
	}
	records.push(
		line({
			observedAt,
			event: {
				kind: "input-request",
				inputRequest: { id: "question", kind: "question", title: "Choose the next task", blocking: true },
			},
		}),
	);
	records.push(
		...parseClaudeEvent({ hook_event_name: "Stop", session_id: "claude-worker" }).map((event) =>
			line({ observedAt, event: { ...event, messageAvailability: "unavailable" } }),
		),
	);
	const logs = new Map([
		[f.attempts[0]!, Buffer.alloc(0)],
		[f.attempts[1]!, Buffer.concat(records)],
	]);
	const result = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, outputReader(logs));
	expect(result.items).toHaveLength(20);
	expect(result.items.every((item) => item.kind === "tool")).toBe(true);
	expect(result.items.at(-1)).toMatchObject({ tool: { input: { command: "read 19" }, output: "result 19" } });
	expect(result.context).toMatchObject([{ text: "I will inspect the files.", completeness: "unproven" }]);
	expect(result.signals).toMatchObject([
		{ kind: "input-request" },
		{ kind: "completion", messageAvailability: "unavailable" },
	]);
});

test("preserves a large UTF-8 message and a partial final record", async () => {
	const f = await fixture();
	const text = "完整 text\n".repeat(100_000);
	const complete = line(
		annotated(
			{ kind: "message", message: { id: "full", text, complete: true } },
			{
				activity: { id: "assistant:full", kind: "message", role: "assistant", text, at: f.at.toISOString() },
			},
		),
	);
	const logs = new Map([
		[f.attempts[0]!, Buffer.alloc(0)],
		[f.attempts[1]!, complete.subarray(0, complete.length - 5)],
	]);
	const reader = outputReader(logs, 65537);
	const partial = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, reader);
	expect(partial.items).toHaveLength(0);
	logs.set(f.attempts[1]!, complete);
	const result = await readSessionObserverActivity(f.context, { runId: f.runId, after: partial.cursor }, reader);
	expect(result.items).toHaveLength(1);
	expect(result.items[0]).toMatchObject({ text });
});

test("retains late work on an older attempt and recovers a temporarily missing log", async () => {
	const f = await fixture();
	const logs = new Map([[f.attempts[1]!, Buffer.alloc(0)]]);
	const reader = outputReader(logs);
	const first = await readSessionObserverActivity(f.context, { runId: f.runId, after: null }, reader);
	expect(first.signals).toMatchObject([{ kind: "unavailable", attemptGeneration: 1 }]);
	logs.set(
		f.attempts[0]!,
		line({ observedAt: f.at.toISOString(), event: { kind: "prompt", prompt: "Late retained work." } }),
	);
	const result = await readSessionObserverActivity(f.context, { runId: f.runId, after: first.cursor }, reader);
	expect(result.items).toMatchObject([{ text: "Late retained work.", attemptGeneration: 1 }]);
	const repeat = await readSessionObserverActivity(f.context, { runId: f.runId, after: result.cursor }, reader);
	expect(repeat.items).toHaveLength(0);
});
