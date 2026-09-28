import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";

export const pauseRestartFixture = (terminalId: string, at: Date): RuntimeProcessStatus => ({
	id: terminalId,
	daemonId: "test",
	pid: null,
	mode: "pty",
	status: "exited",
	startedAt: at.toISOString(),
	endedAt: at.toISOString(),
	exitCode: 0,
	error: null,
	checkedAt: at.toISOString(),
	elapsedMs: 0,
	controllable: false,
	process: null,
	launch: { command: "claude", args: [], cwd: "/nowhere" },
	agent: null,
	activity: null,
	acknowledgedMessageIds: [],
	result: null,
});
