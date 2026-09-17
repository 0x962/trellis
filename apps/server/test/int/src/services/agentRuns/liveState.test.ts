import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { projectRun } from "../../../../../src/services/agentRuns/liveState.ts";
import type { StoredRun } from "../../../../../src/services/agentRuns/queries.ts";

const run: StoredRun = {
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
const process: RuntimeProcessStatus = {
	id: "attempt",
	daemonId: "daemon",
	pid: 100,
	mode: "pty",
	status: "running",
	startedAt: run.createdAt,
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: run.updatedAt,
	elapsedMs: 0,
	agent: null,
	controllable: true,
	process: null,
	launch: null,
	activity: null,
	result: null,
	acknowledgedMessageIds: [],
};

test("live process status overrides assignment closure and old errors", () => {
	expect(projectRun(run, [process])).toMatchObject({ state: "running", processStatus: "running", error: null });
});
test("an open assignment cannot make an exited process appear running", () => {
	expect(projectRun({ ...run, closedAt: null }, [{ ...process, status: "exited", exitCode: 0 }])).toMatchObject({
		state: "exited",
		processStatus: "exited",
	});
});
test("a missing runtime attempt has unknown process status", () => {
	expect(projectRun(run, [])).toMatchObject({ state: "interrupted", processStatus: null });
});

test("a failed provider turn retains its live process status and attempt identity", () => {
	const agent = {
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
		expect(projectRun(run, [{ ...process, status, agent }])).toMatchObject({
			state: "failed",
			processStatus: status,
			terminalId: "attempt",
		});
	}
	expect(projectRun(run, [{ ...process, id: "replaced-attempt", agent }])).toMatchObject({
		state: "interrupted",
		processStatus: null,
		terminalId: "attempt",
	});
});

test("a missing process retains the specific launch failure", () => {
	expect(projectRun({ ...run, error: "Repository directory /missing does not exist" }, [])).toMatchObject({
		state: "interrupted",
		error: "Repository directory /missing does not exist",
	});
});

test.each(["ready", "working", "idle"] as const)(
	"assignment reports include the observed %s turn separately from the process",
	(state) => {
		const activity = { state, updatedAt: run.updatedAt };
		expect(projectRun(run, [{ ...process, activity }])).toMatchObject({
			processStatus: "running",
			observation: { checkedAt: process.checkedAt, controllable: true, activity, outcome: null, turnId: null },
		});
	},
);

test("missing attempts have no current observation, even with a saved session and old error", () => {
	expect(projectRun(run, [])).toMatchObject({ processStatus: null, observation: null });
});
