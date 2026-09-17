import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { NOW } from "./services.ts";

export const controllerSession = (
	id = "attempt",
	overrides: Partial<RuntimeProcessStatus> = {},
): RuntimeProcessStatus => ({
	id,
	daemonId: "daemon",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: NOW.toISOString(),
	endedAt: null,
	exitCode: null,
	error: null,
	checkedAt: NOW.toISOString(),
	elapsedMs: 0,
	agent: null,
	controllable: true,
	process: {
		pid: 123,
		parentPid: 1,
		groupId: 123,
		identity: "identity",
		startedAt: NOW.toISOString(),
		executable: "/bin/agent",
	},
	launch: { command: "/bin/agent", args: [], cwd: "/tmp" },
	activity: { state: "idle", updatedAt: NOW.toISOString() },
	acknowledgedMessageIds: [id],
	result: null,
	...overrides,
});

export const workingSession = (id: string, durationMs = 10_000): RuntimeProcessStatus =>
	controllerSession(id, {
		activity: {
			state: "working",
			workingSince: new Date(NOW.getTime() - durationMs).toISOString(),
			updatedAt: NOW.toISOString(),
		},
	});
