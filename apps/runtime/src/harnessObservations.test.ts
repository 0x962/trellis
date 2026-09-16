import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { HarnessObservations } from "./harnessObservations.ts";

let home: string;
let path: string;
let observations: HarnessObservations;
beforeEach(() => {
	home = mkdtempSync("/tmp/trl-observation-errors-");
	path = join(home, "events");
	observations = new HarnessObservations(path);
	observations.append({ kind: "prompt", turnId: "turn", prompt: "Run the task" }, "now");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test("the last tool retains its input, output, and times after the turn ends and the journal reopens", () => {
	observations.append(
		{ kind: "tool-start", tool: { id: "tool", name: "Bash", input: { command: "bun test" } } },
		"2026-09-15T12:00:00.000Z",
	);
	observations.append(
		{ kind: "tool-end", tool: { id: "tool", name: "Bash", output: "44 pass" } },
		"2026-09-15T12:00:05.000Z",
	);
	observations.append({ kind: "idle", result: "Tests pass.", outcome: "completed" }, "2026-09-15T12:00:06.000Z");
	for (const current of [observations, new HarnessObservations(path)]) {
		expect(current.agent!.tool).toBeNull();
		expect(current.agent!.lastTool).toEqual({
			id: "tool",
			name: "Bash",
			input: { command: "bun test" },
			output: "44 pass",
			startedAt: "2026-09-15T12:00:00.000Z",
			updatedAt: "2026-09-15T12:00:05.000Z",
			status: "completed",
			error: null,
		});
		expect(current.agent!.lastMessage).toEqual({ text: "Tests pass.", at: "2026-09-15T12:00:06.000Z" });
		expect(current.activity).toEqual({ state: "idle", updatedAt: "2026-09-15T12:00:06.000Z" });
	}
});

test("a message records its text and time without turning an idle agent into a working agent", () => {
	observations.append({ kind: "idle" }, "2026-09-15T12:00:00.000Z");
	observations.append({ kind: "message", message: { text: "I need a decision." } }, "2026-09-15T12:00:01.000Z");
	expect(observations.agent!.lastMessage).toEqual({ text: "I need a decision.", at: "2026-09-15T12:00:01.000Z" });
	expect(observations.activity!.state).toBe("idle");
});

test("the last message survives a later turn with no assistant text", () => {
	observations.append({ kind: "message", message: { text: "The change is ready." } }, "2026-09-15T12:00:00.000Z");
	observations.append({ kind: "idle", result: "A combined result" }, "2026-09-15T12:00:01.000Z");
	observations.append({ kind: "prompt", prompt: "Continue" }, "2026-09-15T12:00:02.000Z");
	observations.append({ kind: "idle", result: "" }, "2026-09-15T12:00:03.000Z");
	expect(new HarnessObservations(path).agent!.lastMessage).toEqual({
		text: "The change is ready.",
		at: "2026-09-15T12:00:00.000Z",
	});
});

test("tool errors stay in the event journal without a session error, including after replay", () => {
	observations.append({ kind: "tool-start", tool: { id: "tool", name: "Bash" } }, "now");
	observations.append({ kind: "tool-end", tool: { id: "tool", name: "Bash" }, error: "exit 1" }, "now");
	expect(observations.agent).toMatchObject({ error: null, outcome: null, tool: null });
	expect(new HarnessObservations(path).agent).toMatchObject({ error: null, outcome: null });
	expect(Buffer.from(observations.log.read(0).data, "base64").toString()).toContain('"error":"exit 1"');
	observations.append({ kind: "idle", outcome: "completed", result: "Task complete" }, "now");
	expect(observations.agent).toMatchObject({ error: null, outcome: "completed" });
});

test("only a successful native completion clears a failure in the same turn", () => {
	observations.append({ kind: "error", error: "Provider failure", outcome: "failed" }, "now");
	observations.append({ kind: "tool-end", tool: { id: "tool", name: "Bash", output: "ok" } }, "now");
	observations.append({ kind: "idle" }, "now");
	expect(observations.agent).toMatchObject({ error: "Provider failure", outcome: "failed" });
	observations.append({ kind: "idle", outcome: "completed", result: "Task complete" }, "now");
	expect(observations.agent).toMatchObject({ error: null, outcome: "completed" });
	expect(new HarnessObservations(path).agent).toMatchObject({ error: null, outcome: "completed" });
});

test("a failed native completion retains its error through interruption", () => {
	observations.append({ kind: "idle", outcome: "failed", error: "Provider failure" }, "now");
	expect(observations.agent).toMatchObject({ error: "Provider failure", outcome: "failed" });
	observations.append({ kind: "idle", outcome: "interrupted" }, "now");
	expect(observations.agent).toMatchObject({ error: "Provider failure", outcome: "interrupted" });
});

test("the last cumulative token total survives journal replay", () => {
	observations.append({ kind: "session", sessionId: "provider", tokenUsage: { totalTokens: 120 } }, "now");
	observations.append({ kind: "session", sessionId: "provider", tokenUsage: { totalTokens: 175 } }, "now");
	for (const current of [observations, new HarnessObservations(path)]) {
		expect(current.agent?.tokenUsage).toEqual({ totalTokens: 175 });
	}
});
