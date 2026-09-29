import { expect, test } from "bun:test";
import { parseClaudeEvent } from "../../agents/harnesses/claude/parseClaudeEvent.ts";
import { readSessionObserverActivity } from "./read.ts";
import { annotated, fixture, line, outputReader } from "./testFixture.ts";

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
