import { expect, test } from "bun:test";
import { AgentRunSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { projectRun } from "./liveState.ts";
import type { StoredRun } from "./queries.ts";

const started = "2026-09-18T12:00:00.000Z";
const updated = "2026-09-18T12:00:01.000Z";

const run: StoredRun = {
	id: "01J00000000000000000000000",
	seenAttention: { attemptId: null, sequence: 0 },
	name: "test",
	accountId: null,
	runtime: "native",
	harness: null,
	kind: "session",
	instruction: "",
	projectId: null,
	projectKey: "",
	ticketId: null,
	ticketIdentifier: null,
	ticketTitle: null,
	ticketStatusCategory: null,
	ticketEpicId: null,
	ticketEpicProjectId: null,
	pinnedAt: null,
	workspaceId: "/tmp",
	terminalId: "attempt",
	url: null,
	error: null,
	sessionId: "conversation",
	sessionLost: false,
	createdAt: started,
	updatedAt: started,
	closedAt: null,
};

const process = (): RuntimeProcessStatus => ({
	id: "attempt",
	daemonId: "daemon",
	pid: 123,
	mode: "pty",
	status: "running",
	startedAt: started,
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
			input: { file_path: "apps/web/src/app.css", content: "the whole file" },
			output: { file: "whole output" },
			startedAt: started,
			updatedAt: updated,
			status: "completed",
			error: null,
		},
		lastMessage: { text: "Done", at: updated },
		error: null,
		outcome: null,
	},
	result: null,
	acknowledgedMessageIds: ["attempt"],
	activity: { state: "working", updatedAt: updated },
	checkedAt: updated,
	controllable: true,
	process: null,
	launch: null,
});

test("projectRun forwards the last message and the last tool as its name, its target and its times", () => {
	const projected = projectRun(run, [process()]);

	expect(projected.observation?.lastMessage).toEqual({ text: "Done", at: updated });
	expect(projected.observation?.lastTool).toEqual({
		name: "Read",
		target: "apps/web/src/app.css",
		targetKind: "code",
		status: "completed",
		startedAt: started,
		updatedAt: updated,
	});
	expect(projected.observation?.lastTool).not.toHaveProperty("input");
	expect(projected.observation?.lastTool).not.toHaveProperty("output");
	expect(AgentRunSchema.parse(projected)).toEqual(projected);
});
