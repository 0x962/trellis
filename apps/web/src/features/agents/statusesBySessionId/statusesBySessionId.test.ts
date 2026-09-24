import { expect, test } from "bun:test";
import type { AgentActivity, AgentRun } from "@trellis/api";
import { statusesBySessionId } from "./statusesBySessionId";

const run = (id: string): AgentRun => ({
	id,
	accountId: null,
	name: id,
	runtime: "native",
	harness: null,
	kind: "session",
	switchedTo: null,
	projectId: null,
	projectKey: "",
	ticketId: null,
	ticketIdentifier: null,
	ticketTitle: null,
	ticketStatusCategory: null,
	ticketEpicId: null,
	ticketEpicProjectId: null,
	pinnedAt: null,
	assigned: true,
	state: "running",
	processStatus: "running",
	workspaceId: null,
	terminalId: "attempt",
	url: null,
	error: null,
	sessionId: null,
	sessionLost: false,
	createdAt: "2026-09-23T00:00:00.000Z",
	updatedAt: "2026-09-23T00:00:00.000Z",
	observation: {
		checkedAt: "2026-09-23T00:00:00.000Z",
		controllable: true,
		activity: { state: "working", updatedAt: "2026-09-23T00:00:00.000Z" },
		lastMessage: null,
		lastTool: null,
		outcome: null,
		turnId: null,
	},
});

const entry = (sessionId: string | null): AgentActivity => ({ run: run("run"), sessionId });

test("a working run gives the working status of its session", () => {
	expect(statusesBySessionId([entry("session")])).toEqual({ session: "working" });
});

test("a run without a session gives no entry", () => {
	expect(statusesBySessionId([entry(null)])).toEqual({});
});
