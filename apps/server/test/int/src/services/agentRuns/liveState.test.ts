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
	expect(projectRun(run, [process])).toMatchObject({ state: "running", error: null });
});
test("an open assignment cannot make an exited process appear running", () => {
	expect(projectRun({ ...run, closedAt: null }, [{ ...process, status: "exited", exitCode: 0 }]).state).toBe("exited");
});
test("a missing runtime attempt has unknown process status", () => {
	expect(projectRun(run, []).state).toBe("interrupted");
});

test("a missing process retains the specific launch failure", () => {
	expect(projectRun({ ...run, error: "Repository directory /missing does not exist" }, [])).toMatchObject({
		state: "interrupted",
		error: "Repository directory /missing does not exist",
	});
});
