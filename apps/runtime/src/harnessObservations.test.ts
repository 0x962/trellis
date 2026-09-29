import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessObservations } from "./harnessObservations.ts";
import { validateHarnessEvent } from "./validateHarnessEvent.ts";

const directories: string[] = [];
afterEach(() => {
	for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
const fixture = (checkpoint?: string) => {
	const directory = mkdtempSync(join(tmpdir(), "trellis-attention-test-"));
	directories.push(directory);
	const path = join(directory, "events");
	return {
		observations: new HarnessObservations(path, checkpoint && join(directory, checkpoint)),
		path,
		checkpointPath: checkpoint && join(directory, checkpoint),
	};
};
const at = "2026-09-18T12:00:00.000Z";
const request = { id: "q1", kind: "question" as const, title: "Choose a color", blocking: true };
const recorded = (path: string) =>
	readFileSync(`${path}.bytes`, "utf8")
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));

test("records one complete logical message after preview and replay events", () => {
	const { observations: state, path } = fixture();
	state.append({ kind: "prompt", turnId: "turn", activityId: "user", prompt: "Do the work." }, at);
	state.append(
		{ kind: "message", turnId: "turn", message: { id: "assistant", text: "I will start.", complete: false } },
		at,
	);
	state.append(
		{
			kind: "message",
			turnId: "turn",
			message: { id: "assistant", text: "I will start. The file is open.", complete: true },
		},
		at,
	);
	state.append(
		{
			kind: "message",
			turnId: "turn",
			message: { id: "assistant", text: "I will start. The file is open.", complete: true },
		},
		at,
	);
	state.append(
		{
			kind: "idle",
			turnId: "turn",
			outcome: "completed",
			result: "I will start. The file is open.",
			resultActivityIds: ["assistant"],
		},
		at,
	);

	const rows = recorded(path);
	expect(rows.map((row) => row.activity?.id).filter(Boolean)).toEqual(["user:user", "assistant:assistant"]);
	expect(rows.map((row) => row.signal?.kind).filter(Boolean)).toEqual(["completion"]);
	expect(rows.at(-1)?.signal).toMatchObject({ messageAvailability: "complete" });
});

test("reports an unproven provider message at completion", () => {
	const { observations: state, path } = fixture();
	state.append({ kind: "message", turnId: "turn", message: { id: "assistant", text: "Still working." } }, at);
	state.append({ kind: "idle", turnId: "turn", outcome: "completed", result: "Done." }, at);

	const rows = recorded(path);
	expect(rows.map((row) => row.activity).filter(Boolean)).toMatchObject([
		{ kind: "message", role: "assistant", text: "Done." },
	]);
	expect(rows.at(-1)?.signal).toMatchObject({ messageAvailability: "unavailable" });
});

test("separates turns when provider events have no turn or message identifier", () => {
	const { observations: state, path } = fixture();
	for (const prompt of ["First request.", "Second request."]) {
		state.append({ kind: "prompt", prompt }, at);
		state.append({ kind: "working" }, at);
		state.append({ kind: "message", message: { text: "Done.", complete: true } }, at);
		state.append({ kind: "idle", outcome: "completed", result: "Done." }, at);
	}

	const rows = recorded(path);
	expect(rows.map((row) => row.activity?.kind).filter(Boolean)).toEqual(["message", "message", "message", "message"]);
	expect(rows.map((row) => row.signal?.kind).filter(Boolean)).toEqual(["completion", "completion"]);
});

test("combines tool updates with one completed tool item", () => {
	const { observations: state, path } = fixture();
	state.append(
		{ kind: "tool-start", turnId: "turn", tool: { id: "tool", name: "Shell", input: { command: "work" } } },
		at,
	);
	state.append({ kind: "tool-update", turnId: "turn", tool: { id: "tool", name: "Shell", output: "one" } }, at);
	state.append({ kind: "tool-update", turnId: "turn", tool: { id: "tool", name: "Shell", output: "two" } }, at);
	state.append({ kind: "tool-end", turnId: "turn", tool: { id: "tool", name: "Shell" } }, at);
	state.append({ kind: "tool-end", turnId: "turn", tool: { id: "tool", name: "Shell" } }, at);

	const activities = recorded(path)
		.map((row) => row.activity)
		.filter(Boolean);
	expect(activities).toHaveLength(1);
	expect(activities[0]).toMatchObject({
		id: "tool:tool",
		tool: { input: { command: "work" }, updates: ["one", "two"] },
	});
});

test("pending questions survive activity and journal replay, then resolve by identifier", () => {
	const { observations: state, path } = fixture();
	state.append({ kind: "working", turnId: "turn-1" }, at);
	state.append({ kind: "input-request", turnId: "turn-1", inputRequest: request }, at);
	state.append({ kind: "input-request", turnId: "turn-1", inputRequest: request }, at);
	state.append({ kind: "tool-start", turnId: "turn-1", tool: { id: "tool", name: "Bash" } }, at);
	expect(state.agent!.attention!.requests).toHaveLength(1);
	expect(new HarnessObservations(path).agent).toEqual(state.agent);
	state.append({ kind: "input-resolved", turnId: "old", requestId: "q1" }, at);
	expect(state.agent!.attention!.requests).toHaveLength(1);
	state.append({ kind: "input-resolved", turnId: "turn-1", requestId: "q1" }, at);
	expect(state.agent!.attention!.requests).toHaveLength(0);
	expect(state.activity!.state).toBe("working");
});

test("completion has a stable sequence and the next turn clears attention", () => {
	const { observations: state, path } = fixture();
	state.append({ kind: "working", turnId: "one" }, at);
	state.append({ kind: "idle", turnId: "one", outcome: "completed" }, at);
	const completion = state.agent!.attention!.completion;
	state.append({ kind: "idle", turnId: "one", outcome: "completed" }, at);
	state.append({ kind: "input-resolved", requestId: "absent" }, at);
	expect(state.agent!.attention!.completion).toEqual(completion);
	expect(state.activity!.state).toBe("idle");
	expect(new HarnessObservations(path).agent!.attention).toEqual(state.agent!.attention);
	state.append({ kind: "working", turnId: "two" }, at);
	expect(state.agent!.attention!.completion).toBeNull();
	state.append({ kind: "idle", turnId: "one", outcome: "completed" }, at);
	expect(state.agent!.attention!.completion).toBeNull();
});

test("retry errors preserve questions; terminal failure clears them without completion", () => {
	const { observations: state } = fixture();
	state.append({ kind: "working", turnId: "turn" }, at);
	state.append({ kind: "input-request", inputRequest: request }, at);
	state.append({ kind: "error", error: "rate limit", willRetry: true }, at);
	expect(state.agent!.attention!.requests).toHaveLength(1);
	expect(state.agent!.attention!.failure).toBeNull();
	state.append({ kind: "error", error: "failed", willRetry: false }, at);
	expect(state.agent!.attention!.requests).toHaveLength(0);
	expect(state.agent!.attention!.failure).not.toBeNull();
	expect(state.agent!.attention!.completion).toBeNull();
});

test("the runtime rejects malformed question payloads at the provider boundary", () => {
	expect(() =>
		validateHarnessEvent({ kind: "input-request", inputRequest: { ...request, questions: [{}] } }),
	).toThrow();
	expect(() => validateHarnessEvent({ kind: "input-request", inputRequest: request })).not.toThrow();
});

test("an interrupted turn records one stop event and preserves interrupted status", () => {
	const { observations: state, path } = fixture();
	state.append({ kind: "working", turnId: "turn" }, at);
	state.append({ kind: "idle", turnId: "turn", outcome: "interrupted" }, at);
	const completion = state.agent!.attention!.completion;
	expect(completion).not.toBeNull();
	state.append({ kind: "idle", turnId: "turn", outcome: "interrupted" }, at);
	expect(state.agent!.attention!.completion).toEqual(completion);
	expect(state.agent!.outcome).toBe("interrupted");
	expect(new HarnessObservations(path).agent!.attention).toEqual(state.agent!.attention);
});

test("the result of an idle event replaces an older message of the same turn", () => {
	const { observations: state, path } = fixture();
	state.append({ kind: "working", turnId: "one" }, at);
	state.append({ kind: "message", turnId: "one", message: { text: "Now cleaning up.", at } }, at);
	state.append(
		{ kind: "idle", turnId: "one", outcome: "completed", result: "Done. PR 245 is open." },
		"2026-09-18T12:01:00.000Z",
	);
	expect(state.agent!.lastMessage).toEqual({ text: "Done. PR 245 is open.", at: "2026-09-18T12:01:00.000Z" });
	expect(new HarnessObservations(path).agent!.lastMessage).toEqual(state.agent!.lastMessage);
});

test("the result of an idle event keeps the time of the message that holds the same text", () => {
	const { observations: state } = fixture();
	state.append({ kind: "working", turnId: "one" }, at);
	state.append({ kind: "message", turnId: "one", message: { text: "Done.", at } }, at);
	state.append({ kind: "idle", turnId: "one", outcome: "completed", result: "Done." }, "2026-09-18T12:01:00.000Z");
	expect(state.agent!.lastMessage).toEqual({ text: "Done.", at });
});

test("a tool event that arrives after the idle event of its turn leaves the agent idle", () => {
	const { observations: state } = fixture();
	state.append({ kind: "working", turnId: "one" }, at);
	state.append({ kind: "tool-start", turnId: "one", tool: { id: "tool", name: "commandExecution" } }, at);
	state.append({ kind: "idle", turnId: "one", outcome: "completed" }, at);
	state.append({ kind: "tool-update", turnId: "one", tool: { id: "tool", name: "commandExecution" } }, at);
	state.append({ kind: "tool-end", turnId: "one", tool: { id: "tool", name: "commandExecution" } }, at);
	expect(state.activity!.state).toBe("idle");
	state.append({ kind: "working", turnId: "two" }, at);
	state.append({ kind: "tool-end", turnId: "two", tool: { id: "tool", name: "commandExecution" } }, at);
	expect(state.activity!.state).toBe("working");
});

// Codex runs several commands at once. The order comes from the event log of
// a recorded Codex run: three commands start, the output of an older one
// arrives, and the newest one ends first.
test("the end of one parallel tool shows the newest tool that still runs", () => {
	const { observations: state, path } = fixture();
	const shell = (id: string, command: string) => ({ id, name: "Shell", input: { command } });
	state.append({ kind: "working", turnId: "turn" }, at);
	state.append({ kind: "tool-start", turnId: "turn", tool: shell("brief", "trellis brief OP-81") }, at);
	state.append({ kind: "tool-start", turnId: "turn", tool: shell("rg", "rg -n OP-81 MEMORY.md") }, at);
	state.append({ kind: "tool-start", turnId: "turn", tool: shell("status", "git status --short") }, at);
	state.append({ kind: "tool-update", turnId: "turn", tool: { id: "brief", name: "Shell", output: "# OP-81" } }, at);
	expect(state.agent!.lastTool).toMatchObject({ id: "status", status: "running" });
	state.append({ kind: "tool-end", turnId: "turn", tool: { id: "status", name: "Shell" } }, at);
	expect(state.agent!.lastTool).toMatchObject({
		id: "rg",
		status: "running",
		input: { command: "rg -n OP-81 MEMORY.md" },
	});
	expect(state.agent!.tool!.id).toBe("rg");
	state.append({ kind: "tool-end", turnId: "turn", tool: { id: "brief", name: "Shell" } }, at);
	expect(state.agent!.lastTool!.id).toBe("rg");
	state.append({ kind: "tool-end", turnId: "turn", tool: { id: "rg", name: "Shell" } }, at);
	expect(state.agent!.lastTool).toMatchObject({ id: "rg", status: "completed" });
	expect(state.agent!.tool).toBeNull();
	expect(new HarnessObservations(path).agent).toEqual(state.agent);
});

test("a checkpoint answers for the events it covers, and later events still apply", () => {
	const { observations: state, path, checkpointPath } = fixture("agent.json");
	state.append({ kind: "session", sessionId: "provider-conversation", model: "opus" }, at);
	state.append({ kind: "working", turnId: "turn-1" }, at);
	state.append(
		{ kind: "tool-start", turnId: "turn-1", tool: { id: "tool", name: "Bash", input: { command: "work" } } },
		at,
	);
	state.append({ kind: "tool-update", turnId: "turn-1", tool: { id: "tool", name: "Bash", output: "saved" } }, at);
	state.saveCheckpoint();
	const loaded = new HarnessObservations(path, checkpointPath);
	expect(loaded.checkpointed).toBe(true);
	expect(loaded.agent).toEqual(state.agent);
	expect(loaded.activity).toEqual(state.activity);
	// The tool map of the checkpoint carries over, so the end of that tool
	// leaves no tool running.
	loaded.append({ kind: "tool-end", turnId: "turn-1", tool: { id: "tool", name: "Bash" } }, at);
	expect(loaded.agent!.tool).toBe(null);
	expect(loaded.agent!.lastTool!.status).toBe("completed");
	expect(recorded(path).at(-1)?.activity).toMatchObject({
		id: "tool:tool",
		tool: { input: { command: "work" }, updates: ["saved"] },
	});
});

test("a checkpoint written after more events covers those events too", () => {
	const { observations: state, path, checkpointPath } = fixture("agent.json");
	state.append({ kind: "working", turnId: "turn-1" }, at);
	state.saveCheckpoint();
	state.append({ kind: "message", message: { text: "Done" } }, at);
	state.append({ kind: "idle", turnId: "turn-1", outcome: "completed" }, at);
	state.saveCheckpoint();
	const loaded = new HarnessObservations(path, checkpointPath);
	expect(loaded.agent).toEqual(state.agent);
	expect(loaded.agent!.attention!.sequence).toBe(state.agent!.attention!.sequence);
});
