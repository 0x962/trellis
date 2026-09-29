import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { NativeHandleV1 } from "../../../langflowContracts";

export function runtimeFixture(handle: NativeHandleV1): RuntimeProcessStatus {
	return {
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
}
