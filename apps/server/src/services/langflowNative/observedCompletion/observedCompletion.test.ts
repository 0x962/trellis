import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { NativeHandleV1Schema, NativeLaunchProvenanceV1Schema } from "../../../langflowContracts";
import provenanceJson from "../../../langflowContracts/fixtures/launch-provenance.json";
import handleJson from "../../../langflowContracts/fixtures/native-handle.json";
import { observedCompletion } from "./observedCompletion";

function fixture() {
	const provenance = NativeLaunchProvenanceV1Schema.parse(provenanceJson);
	const handle = NativeHandleV1Schema.parse({ ...handleJson, providerSessionId: "session-1" });
	const run = { id: handle.agentRunId, terminalId: handle.attemptId, sessionId: "session-1" };
	const runtime: RuntimeProcessStatus = {
		id: handle.attemptId,
		daemonId: "daemon-1",
		pid: 123,
		mode: "pty",
		status: "running",
		startedAt: "2026-09-29T06:00:00.000Z",
		endedAt: null,
		exitCode: null,
		error: null,
		elapsedMs: 100,
		agent: {
			sessionId: "session-1",
			model: null,
			turnId: "turn-1",
			tool: null,
			lastTool: null,
			lastMessage: null,
			error: null,
			outcome: "completed",
		},
		result: { id: "result-1", text: "YES\n" },
		acknowledgedMessageIds: [handle.attemptId],
		activity: { state: "idle", updatedAt: "2026-09-29T06:00:01.000Z" },
		checkedAt: "2026-09-29T06:00:01.000Z",
		controllable: true,
		process: null,
		launch: null,
	};
	return { provenance, handle, run, runtime };
}

test("accepts the exact attempt and initial prompt receipt with complete output", () => {
	const input = fixture();
	input.runtime.result!.text = `${"x".repeat(1_100_000)}\n`;
	const result = observedCompletion(input);
	expect(result.state).toBe("completed");
	if (result.state !== "completed") throw new Error("Expected a completion");
	expect(result.completion.result.output).toBe(input.runtime.result!.text);
	expect(observedCompletion(structuredClone(input))).toEqual(result);
});

test("rejects an old attempt or another provider session", () => {
	const input = fixture();
	input.runtime.id = crypto.randomUUID();
	expect(observedCompletion(input).state).toBe("unknown");
	input.runtime.id = input.handle.attemptId;
	input.runtime.agent!.sessionId = "another-session";
	expect(observedCompletion(input).state).toBe("unknown");
});

test("waits for the late provider session to match both durable identities", () => {
	const input = fixture();
	input.handle.providerSessionId = null;
	input.run.sessionId = "session-1";
	expect(observedCompletion(input).state).toBe("unknown");
	input.handle.providerSessionId = "session-1";
	expect(observedCompletion(input).state).toBe("completed");
});

test("requires the initial prompt receipt rather than another message receipt", () => {
	const input = fixture();
	input.runtime.acknowledgedMessageIds = [crypto.randomUUID()];
	expect(observedCompletion(input)).toEqual({ state: "unknown", reason: "prompt_or_result_missing" });
});

test("does not accept a retained result during an unknown or active attempt", () => {
	const input = fixture();
	input.runtime.status = "unknown";
	expect(observedCompletion(input).state).toBe("unknown");
	input.runtime.status = "running";
	input.runtime.activity!.state = "working";
	expect(observedCompletion(input).state).toBe("waiting_native");
});

test("does not invent a completion after process failure", () => {
	const input = fixture();
	input.runtime.agent!.outcome = "failed";
	expect(observedCompletion(input)).toEqual({ state: "failed", reason: "process_error" });
});

test("retains the result identity when changed bytes must conflict in storage", () => {
	const input = fixture();
	const first = observedCompletion(input);
	input.runtime.result!.text = "NO\n";
	const second = observedCompletion(input);
	if (first.state !== "completed" || second.state !== "completed") throw new Error("Expected completions");
	expect(second.completion.result.completionId).toBe(first.completion.result.completionId);
	expect(second.resultBytes).not.toBe(first.resultBytes);
});
