import { expect, test } from "bun:test";
import type { AgentRun } from "../schemas/agentRun.ts";
import { at, session } from "../sessionStatus/fixture.ts";
import { runLine } from "./runLine.ts";

const completed = (): AgentRun => ({
	...session().run,
	kind: "agent",
	ticketId: "ticket",
	ticketStatusCategory: "done",
	state: "stopped",
	processStatus: "exited",
});

test("a completed ticket needs no completion record", () => {
	for (const attention of [undefined, { ...session().run.observation!.attention!, completion: null }]) {
		const run = completed();
		run.observation = { ...run.observation!, attention };
		expect(runLine(run)).toMatchObject({ kind: "idle", since: at });
	}
	const run = completed();
	run.ticketStatusCategory = "started";
	run.observation = { ...run.observation!, outcome: "completed", attention: undefined };
	expect(runLine(run)).toMatchObject({ kind: "idle", since: at });
});

test("a stopped completion keeps its recorded time without a new-turn claim", () => {
	for (const state of ["stopped", "exited"] as const) {
		const run = completed();
		run.state = state;
		run.observation!.attention!.completion = { sequence: 2, at };
		for (const sequence of [0, 2]) {
			run.seenAttention = { attemptId: run.terminalId!, sequence };
			expect(runLine(run)).toMatchObject({ kind: "turn-done", since: at });
		}
	}
});

test("a live ticket completion distinguishes unseen and seen records", () => {
	const run = completed();
	run.state = "running";
	run.processStatus = "running";
	run.observation!.outcome = "completed";
	run.observation!.attention!.completion = { sequence: 2, at };
	expect(runLine(run)).toMatchObject({ kind: "turn-done-new", since: at });
	run.seenAttention = { attemptId: run.terminalId!, sequence: 2 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done", since: at });
});
