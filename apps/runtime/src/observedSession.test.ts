import { expect, test } from "bun:test";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import { observedSession } from "./observedSession.ts";

const session: RuntimeSession = {
	id: "attempt",
	daemonId: "daemon",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-15T12:00:00.000Z",
	endedAt: null,
	exitCode: null,
	error: null,
};
const process = {
	pid: 123,
	parentPid: 100,
	groupId: 123,
	identity: "123:100:1",
	startedAt: session.startedAt,
	executable: "/bin/cat",
};

test("a dead process overrides a saved running status", () => {
	expect(observedSession(session, process.identity, { kind: "missing" }, false).status).toBe("exited");
});

test("PID reuse does not claim the replacement process", () => {
	const result = observedSession(
		session,
		process.identity,
		{
			kind: "live",
			process: { ...process, identity: "123:200:2" },
		},
		false,
	);
	expect(result.status).toBe("exited");
	expect(result.process).toBeNull();
	expect(result.controllable).toBe(false);
});

test("live kernel identity overrides a saved stopped status", () => {
	const result = observedSession({ ...session, status: "exited" }, process.identity, { kind: "live", process }, true);
	expect(result.status).toBe("running");
	expect(result.controllable).toBe(true);
	expect(result.process).toEqual(process);
});

test("a live process survives daemon recovery without a new owner", () => {
	const result = observedSession(session, process.identity, { kind: "live", process }, false);
	expect(result.status).toBe("running");
	expect(result.controllable).toBe(false);
});

test("a legacy record cannot identify a process by PID alone", () => {
	expect(observedSession(session, null, { kind: "live", process }, false).status).toBe("unknown");
});

test("failed OS inspection reports unknown with its error", () => {
	const result = observedSession(session, process.identity, { kind: "unknown", error: "Permission denied" }, true);
	expect(result.status).toBe("unknown");
	expect(result.error).toBe("Permission denied");
});

test("an owned process waits for stream completion and child cleanup", () => {
	expect(observedSession(session, process.identity, { kind: "missing" }, true).status).toBe("unknown");
});

test("a canceled launch remains exited without a PID", () => {
	expect(
		observedSession(
			{ ...session, pid: null, status: "exited", endedAt: session.startedAt },
			null,
			{ kind: "missing" },
			false,
		).status,
	).toBe("exited");
});
