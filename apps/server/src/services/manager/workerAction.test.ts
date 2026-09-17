import { expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { workerAction } from "./workerAction.ts";

const session: RuntimeProcessStatus = {
	id: "session",
	daemonId: "daemon",
	pid: 1,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-17T06:18:00.000Z",
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 150_000,
	agent: {
		sessionId: "provider-session",
		model: "model",
		turnId: "turn",
		tool: null,
		lastTool: null,
		lastMessage: { text: "Ready", at: "2026-09-17T06:19:00.000Z" },
		error: null,
		outcome: null,
	},
	result: null,
	acknowledgedMessageIds: [],
	activity: { state: "working", updatedAt: "2026-09-17T06:19:50.000Z" },
	checkedAt: "2026-09-17T06:20:00.000Z",
	controllable: true,
	process: null,
	launch: null,
};

test("keeps a worker with recent working activity", () => {
	expect(workerAction(session, new Date("2026-09-17T06:20:00.000Z"))).toBe("keep");
});

test("restarts a worker with stale working activity", () => {
	expect(workerAction(session, new Date("2026-09-17T06:21:00.000Z"))).toBe("restart");
});
