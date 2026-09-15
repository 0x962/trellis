import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { readNativeHarness } from "../../../../../src/services/agentRuns/readNativeHarness.ts";

const run = { runtime: "native" as const, terminalId: "attempt", sessionId: "conversation" };
const processStatus = (change: Partial<RuntimeProcessStatus> = {}): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "daemon",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-15T12:00:00Z",
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: "2026-09-15T12:01:00Z",
	controllable: true,
	process: null,
	launch: null,
	activity: { state: "idle", updatedAt: "2026-09-15T12:01:00Z" },
	acknowledgedMessageIds: ["attempt"],
	result: { id: "completion", text: "YES" },
	...change,
});
const read = (session: RuntimeProcessStatus) =>
	readNativeHarness({ home: "/tmp/unused" }, run, { inspect: async () => session });

test("flow observation uses the inspected PTY turn, result, and receipt", async () => {
	expect(await read(processStatus())).toEqual({
		state: "idle",
		sessionId: "conversation",
		resultId: "completion",
		result: "YES",
		acknowledgedMessageIds: ["attempt"],
		error: null,
	});
});

test("an active turn stays working while a missing process remains unknown", async () => {
	expect((await read(processStatus({ activity: { state: "working", updatedAt: "now" } })))?.state).toBe("working");
	expect(
		(await read(processStatus({ status: "unknown", controllable: false, error: "Process identity changed" })))?.state,
	).toBe("unknown");
	expect((await read(processStatus({ activity: null })))?.state).toBe("unknown");
});

test("a completed turn survives process stop but an exit without a result fails", async () => {
	const exited = processStatus({ status: "exited", controllable: false, exitCode: 143 });
	expect((await read(exited))?.state).toBe("idle");
	expect((await read({ ...exited, result: null }))?.state).toBe("failed");
});

test("an exited attempt retains a completed result after runtime restart clears its activity", async () => {
	const retained = processStatus({ status: "exited", controllable: false, activity: null });
	expect(await read(retained)).toMatchObject({ state: "idle", resultId: "completion", result: "YES" });
});

test("an exit during a later active turn does not reuse the prior turn result", async () => {
	const interrupted = processStatus({
		status: "exited",
		controllable: false,
		activity: { state: "working", updatedAt: "2026-09-15T12:02:00Z" },
	});
	expect((await read(interrupted))?.state).toBe("failed");
});
