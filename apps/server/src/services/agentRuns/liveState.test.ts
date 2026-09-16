import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { executionMetrics, groupAttemptIdsByRun, indexRuntimeSessions, projectRun } from "./liveState.ts";
import type { StoredRun } from "./queries.ts";

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

test("attempt ids group by run without scanning per run", () => {
	expect(groupAttemptIdsByRun([])).toEqual(new Map());
	expect(
		groupAttemptIdsByRun([
			{ id: "attempt-1", runId: "run-1" },
			{ id: "attempt-2", runId: "run-1" },
			{ id: "attempt-3", runId: "run-2" },
		]),
	).toEqual(
		new Map([
			["run-1", ["attempt-1", "attempt-2"]],
			["run-2", ["attempt-3"]],
		]),
	);
});

const storedRun: StoredRun = {
	id: "run",
	name: "Hana",
	runtime: "native",
	personaId: null,
	personaName: "Manager",
	kind: "manager",
	instruction: "Manage",
	projectId: null,
	projectPath: "TRL",
	ticketId: null,
	ticketIdentifier: null,
	closedAt: "2026-09-15T10:00:00.000Z",
	workspaceId: "/tmp",
	terminalId: "attempt",
	url: null,
	error: "Old launch error",
	sessionId: "conversation",
	sessionLost: false,
	createdAt: "2026-09-15T09:00:00.000Z",
	updatedAt: "2026-09-15T10:00:00.000Z",
};

test("live process status overrides assignment closure and old errors", () => {
	expect(projectRun(storedRun, indexRuntimeSessions([process]))).toMatchObject({
		state: "running",
		processStatus: "running",
		error: null,
	});
});

test("an open assignment cannot make an exited process appear running", () => {
	expect(
		projectRun({ ...storedRun, closedAt: null }, indexRuntimeSessions([{ ...process, status: "exited", exitCode: 0 }])),
	).toMatchObject({ state: "exited", processStatus: "exited" });
});

test("a missing runtime attempt has unknown process status", () => {
	expect(projectRun(storedRun, indexRuntimeSessions([]))).toMatchObject({ state: "interrupted", processStatus: null });
});

test("a failed provider turn retains its live process status and attempt identity", () => {
	const failedAgent = {
		sessionId: "conversation",
		turnId: "failed-turn",
		model: "fixture-model",
		tool: null,
		lastTool: null,
		lastMessage: null,
		error: "Provider request failed.",
		outcome: "failed" as const,
	};
	for (const status of ["running", "exited", "unknown"] as const) {
		expect(projectRun(storedRun, indexRuntimeSessions([{ ...process, status, agent: failedAgent }]))).toMatchObject({
			state: "failed",
			processStatus: status,
			terminalId: "attempt",
		});
	}
	expect(
		projectRun(storedRun, indexRuntimeSessions([{ ...process, id: "replaced-attempt", agent: failedAgent }])),
	).toMatchObject({
		state: "interrupted",
		processStatus: null,
		terminalId: "attempt",
	});
});

test("a missing process retains the specific launch failure", () => {
	expect(
		projectRun({ ...storedRun, error: "Repository directory /missing does not exist" }, indexRuntimeSessions([])),
	).toMatchObject({
		state: "interrupted",
		error: "Repository directory /missing does not exist",
	});
});

test.each(["ready", "working", "idle"] as const)(
	"assignment reports include the observed %s turn separately from the process",
	(state) => {
		const activity = { state, updatedAt: storedRun.updatedAt };
		expect(projectRun(storedRun, indexRuntimeSessions([{ ...process, activity }]))).toMatchObject({
			processStatus: "running",
			observation: { checkedAt: process.checkedAt, controllable: true, activity, outcome: null, turnId: null },
		});
	},
);

test("missing attempts have no current observation, even with a saved session and old error", () => {
	expect(projectRun(storedRun, indexRuntimeSessions([]))).toMatchObject({ processStatus: null, observation: null });
});
