import { expect, test } from "bun:test";
import { AgentRunSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { session } from "../../../../../packages/api/src/sessionStatus/fixture.ts";
import { projectRun } from "./liveState.ts";

const at = "2026-09-18T12:00:00.000Z";
const later = "2026-09-18T12:00:01.000Z";

const process = (): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "daemon",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: at,
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 1000,
	agent: {
		sessionId: "conversation",
		model: "model",
		turnId: "turn",
		tool: null,
		lastTool: {
			id: "tool",
			name: "Read",
			input: { file: "whole input" },
			output: { file: "whole output" },
			startedAt: at,
			updatedAt: later,
			status: "completed",
			error: null,
		},
		lastMessage: { text: "Done", at: later },
		error: null,
		outcome: null,
	},
	result: null,
	acknowledgedMessageIds: ["attempt"],
	activity: { state: "working", updatedAt: later },
	checkedAt: later,
	controllable: true,
	process: null,
	launch: null,
});

test("projectRun forwards a bounded last message and last tool", () => {
	const projected = projectRun(
		{
			...session().run,
			id: "01J00000000000000000000000",
			closedAt: null,
		},
		[process()],
	);

	expect(projected.observation?.lastMessage).toEqual({ text: "Done", at: later });
	expect(projected.observation?.lastTool).toEqual({
		name: "Read",
		status: "completed",
		startedAt: at,
		updatedAt: later,
	});
	expect(projected.observation?.lastTool).not.toHaveProperty("input");
	expect(projected.observation?.lastTool).not.toHaveProperty("output");
	expect(AgentRunSchema.parse(projected)).toEqual(projected);
});
