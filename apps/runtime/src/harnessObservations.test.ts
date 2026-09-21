import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessObservations } from "./harnessObservations.ts";
import { validateHarnessEvent } from "./validateHarnessEvent.ts";

const directories: string[] = [];
afterEach(() => {
	for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
const fixture = () => {
	const directory = mkdtempSync(join(tmpdir(), "trellis-attention-test-"));
	directories.push(directory);
	const path = join(directory, "events");
	return { observations: new HarnessObservations(path), path };
};
const at = "2026-09-18T12:00:00.000Z";
const request = { id: "q1", kind: "question" as const, title: "Choose a color", blocking: true };

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
