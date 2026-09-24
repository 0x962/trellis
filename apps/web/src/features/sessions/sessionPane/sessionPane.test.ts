import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { canStartAgent, sessionPane } from "./sessionPane";

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
		expect(sessionPane(run()).kind).toBe("terminal");
	});

	test("draws the terminal while the process starts", () => {
		expect(sessionPane(run({ state: "starting", processStatus: null })).kind).toBe("terminal");
	});

	test("draws the terminal for a runtime that trellis does not start", () => {
		expect(sessionPane(run({ runtime: "superset", processStatus: "exited" })).kind).toBe("terminal");
	});

	test("says that the agent stopped before it finished, in plain words", () => {
		const pane = sessionPane(run({ state: "failed", processStatus: "exited", error: exitLine }));

		expect(pane).toEqual({
			kind: "failed",
			title: "The agent stopped before it finished",
			description:
				"Trellis keeps the workspace and every file in it. A new start opens a new agent in the same workspace.",
			detail: exitLine,
		});
	});

	test("keeps the process line out of the title", () => {
		const pane = sessionPane(run({ state: "exited", processStatus: "exited", error: exitLine }));

		expect(pane.kind).toBe("failed");
		expect(pane).toMatchObject({ detail: exitLine });
		if (pane.kind === "failed") expect(pane.title).not.toContain("exited with code");
	});

	test("calls a clean stop a pause, and names what a resume keeps", () => {
		const pane = sessionPane(run({ state: "stopped", processStatus: "exited" }));

		expect(pane).toEqual({
			kind: "paused",
			title: "The agent is paused",
			description:
				"Trellis keeps the conversation, the workspace and every file in it. Resume opens the same conversation in the same workspace.",
		});
	});

	test("keeps a failed process out of the paused words", () => {
		expect(sessionPane(run({ state: "failed", processStatus: "exited", error: exitLine })).kind).toBe("failed");
	});
});

describe("canStartAgent", () => {
	test("starts a session that holds no terminal", () => {
		expect(canStartAgent(run({ terminalId: null, processStatus: "exited" }), true)).toBe(true);
	});

	test("resumes a ticket agent through the terminal it holds", () => {
		expect(canStartAgent(run({ processStatus: "exited" }), false)).toBe(true);
	});

	test("starts nothing for a ticket agent with no terminal", () => {
		expect(canStartAgent(run({ terminalId: null, processStatus: "exited" }), false)).toBe(false);
	});

	test("starts nothing while the process starts", () => {
		expect(canStartAgent(run({ state: "starting" }), true)).toBe(false);
	});
});
