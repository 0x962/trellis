import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { executionMetrics } from "./liveState.ts";

const process = {
	id: "attempt",
	daemonId: "daemon",
	pid: 100,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-15T09:00:00.000Z",
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: "2026-09-15T10:00:00.000Z",
	elapsedMs: 0,
	agent: null,
	controllable: true,
	process: null,
	launch: null,
	activity: null,
	result: null,
	acknowledgedMessageIds: [],
} satisfies RuntimeProcessStatus;

const agent = {
	sessionId: "conversation",
	model: "fixture-model",
	turnId: "turn",
	tool: null,
	lastTool: null,
	lastMessage: null,
	error: null,
	outcome: null,
};

test("execution metrics sum attempt time and count cumulative session tokens once", () => {
	const sessions = new Map(
		[
			{
				...process,
				id: "attempt-1",
				elapsedMs: 100,
				agent: { ...agent, sessionId: "session-1", tokenUsage: { totalTokens: 100 } },
			},
			{
				...process,
				id: "attempt-2",
				elapsedMs: 200,
				agent: { ...agent, sessionId: "session-1", tokenUsage: { totalTokens: 150 } },
			},
			{
				...process,
				id: "attempt-3",
				elapsedMs: 300,
				agent: { ...agent, sessionId: "session-2", tokenUsage: { totalTokens: 40 } },
			},
		].map((session) => [session.id, session] as const),
	);
	expect(executionMetrics(["attempt-1", "attempt-2", "attempt-3"], sessions)).toEqual({
		durationMs: 600,
		tokenCount: 190,
	});
});

test("execution metrics mark missing usage as unavailable", () => {
	const sessions = new Map([[process.id, process]]);
	expect(executionMetrics(["attempt"], sessions)).toEqual({ durationMs: 0, tokenCount: null });
	expect(executionMetrics(["missing"], sessions)).toEqual({ durationMs: null, tokenCount: null });
});
