import { describe, expect, test } from "bun:test";
import type { AgentRun, Session } from "@trellis/api";
import { canArchiveSession, canStartAgent, isSessionArchived, sessionPane } from "./sessionPane";

const exitLine = "Process /Users/nk/Library/Application Support/Trellis/releases/b726b5e3/bin/node exited with code 1";

const run = (fields: Partial<AgentRun> = {}) =>
	({
		id: "01M37KDXE1YZY0ASKS5K7H683K",
		name: "Fix the error pages",
		runtime: "native",
		kind: "session",
		state: "running",
		processStatus: "running",
		terminalId: "terminal-1",
		error: null,
		...fields,
	}) as AgentRun;

describe("sessionPane", () => {
	test("draws the terminal while the process lives", () => {
		expect(sessionPane(run(), false).kind).toBe("terminal");
	});

	test("draws the terminal while the process starts", () => {
		expect(sessionPane(run({ state: "starting", processStatus: null }), false).kind).toBe("terminal");
	});

	test("draws the terminal for a runtime that trellis does not start", () => {
		expect(sessionPane(run({ runtime: "superset", processStatus: "exited" }), false).kind).toBe("terminal");
	});

	test("says that the agent stopped before it finished, in plain words", () => {
		const pane = sessionPane(run({ state: "failed", processStatus: "exited", error: exitLine }), false);

		expect(pane).toEqual({
			kind: "failed",
			title: "The agent stopped before it finished",
			description:
				"Trellis keeps the workspace and every file in it. A new start opens a new agent in the same workspace.",
			detail: exitLine,
		});
	});

	test("keeps the process line out of the title", () => {
		const pane = sessionPane(run({ state: "exited", processStatus: "exited", error: exitLine }), false);

		expect(pane.kind).toBe("failed");
		expect(pane).toMatchObject({ detail: exitLine });
		if (pane.kind === "failed") expect(pane.title).not.toContain("exited with code");
	});

	test("names the archive of a session whose process still runs", () => {
		const pane = sessionPane(run(), true);

		expect(pane).toEqual({
			kind: "archived",
			title: "This session is archived",
			description:
				"Trellis keeps the workspace, every file in it, and the conversation. Unarchive the session to start its agent again.",
		});
	});

	// An archive is no pause. The agent of an archived session stays stopped
	// until a person unarchives it.
	test("keeps the archive apart from the pause", () => {
		expect(sessionPane(run({ state: "stopped", processStatus: "exited" }), true).kind).toBe("archived");
	});

	test("calls a clean stop a pause, and names what a resume keeps", () => {
		const pane = sessionPane(run({ state: "stopped", processStatus: "exited" }), false);

		expect(pane).toEqual({
			kind: "paused",
			title: "The agent is paused",
			description:
				"Trellis keeps the conversation, the workspace and every file in it. Resume opens the same conversation in the same workspace.",
		});
	});

	test("keeps a failed process out of the paused words", () => {
		expect(sessionPane(run({ state: "failed", processStatus: "exited", error: exitLine }), false).kind).toBe("failed");
	});
});

describe("canStartAgent", () => {
	test("starts a session that holds no terminal", () => {
		expect(canStartAgent(run({ terminalId: null, processStatus: "exited" }), true, false)).toBe(true);
	});

	test("resumes a ticket agent through the terminal it holds", () => {
		expect(canStartAgent(run({ processStatus: "exited" }), false, false)).toBe(true);
	});

	test("starts nothing for a ticket agent with no terminal", () => {
		expect(canStartAgent(run({ terminalId: null, processStatus: "exited" }), false, false)).toBe(false);
	});

	test("starts nothing while the process starts", () => {
		expect(canStartAgent(run({ state: "starting" }), true, false)).toBe(false);
	});

	test("starts nothing for an archived session", () => {
		expect(canStartAgent(run({ processStatus: "exited" }), true, true)).toBe(false);
	});
});

const session = (fields: Partial<Session> = {}) =>
	({ id: "01M37K60PW5H6X7X0A7Q2BSB7C", name: "crisp-fjord", projectId: null, archivedAt: null, ...fields }) as Session;

describe("isSessionArchived", () => {
	test("reads the archive time of the session", () => {
		expect(isSessionArchived(session({ archivedAt: "2026-09-24T03:25:40.470Z" }))).toBe(true);
		expect(isSessionArchived(session())).toBe(false);
	});

	test("calls a run without a session not archived", () => {
		expect(isSessionArchived(undefined)).toBe(false);
	});
});

describe("canArchiveSession", () => {
	test("archives a session that holds no project", () => {
		expect(canArchiveSession(session())).toBe(true);
	});

	test("archives no session of a project", () => {
		expect(canArchiveSession(session({ projectId: "01M24SPHTX36AJ3VKTNZ263E7V" }))).toBe(false);
	});

	test("archives nothing for a run without a session", () => {
		expect(canArchiveSession(undefined)).toBe(false);
	});
});
