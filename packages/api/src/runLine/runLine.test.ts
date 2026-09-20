import { expect, test } from "bun:test";
import type { AgentRun } from "../schemas/agentRun.ts";
import { at, session } from "../sessionStatus/fixture.ts";
import { runLine } from "./runLine.ts";

const value = () => {
	const run = session().run;
	run.name = "crisp-fjord";
	return run;
};

const attention = (run: AgentRun) => run.observation!.attention!;

test("starts from a launch without a process", () => {
	const run = value();
	run.state = "starting";
	run.processStatus = null;
	run.observation = null;
	expect(runLine(run)).toMatchObject({ kind: "starts", words: "starts", at: null });
});

test("works with the current tool and its start time", () => {
	const run = value();
	run.observation!.lastTool = { name: "Edit", status: "running", startedAt: at, updatedAt: at };
	expect(runLine(run)).toMatchObject({ kind: "works", words: "works, tool Edit", at });
});

test("works without a current tool", () => {
	const run = value();
	expect(runLine(run)).toMatchObject({ kind: "works", words: "works", at });
});

test("adds the last message as the second line", () => {
	const run = value();
	run.observation!.lastMessage = { text: "The cap is in settings.", at };
	expect(runLine(run).lastMessage).toEqual({ words: "crisp-fjord: The cap is in settings.", at });
});

test("asks with the harness question text", () => {
	const run = value();
	attention(run).requests = [
		{
			id: "question",
			kind: "question",
			title: "The agent has a question",
			blocking: true,
			questions: [{ id: "0", question: "Which cap?", options: [], multiple: false }],
			sequence: 2,
			at,
		},
	];
	expect(runLine(run)).toMatchObject({ kind: "question", words: "asks: Which cap?", at });
});

test("asks to run a permission tool", () => {
	const run = value();
	attention(run).requests = [
		{ id: "permission", kind: "permission", title: "Approve Bash", blocking: true, sequence: 2, at },
	];
	expect(runLine(run)).toMatchObject({ kind: "permission", words: "asks to run: Bash", at });
});

test("asks for an elicitation field", () => {
	const run = value();
	attention(run).requests = [
		{ id: "elicitation", kind: "elicitation", title: "Project name", blocking: true, sequence: 2, at },
	];
	expect(runLine(run)).toMatchObject({ kind: "elicitation", words: "asks: Project name", at });
});

test("idles from the activity signal", () => {
	const run = value();
	run.observation!.activity = { state: "idle", updatedAt: at };
	expect(runLine(run)).toMatchObject({ kind: "idle", words: "idle", at });
});

test("shows a seen completion as turn done", () => {
	const run = value();
	run.observation!.activity = { state: "idle", updatedAt: at };
	run.observation!.outcome = "completed";
	attention(run).completion = { sequence: 2, at };
	run.seenAttention = { attemptId: "attempt", sequence: 2 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done", words: "turn done", at });
});

test("shows a completion from an earlier attempt marker as new", () => {
	const run = value();
	run.observation!.activity = { state: "idle", updatedAt: at };
	run.observation!.outcome = "completed";
	attention(run).completion = { sequence: 2, at };
	run.seenAttention = { attemptId: "attempt", sequence: 1 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done-new", words: "turn done · new", at });
	run.seenAttention = { attemptId: "earlier-attempt", sequence: 9 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done-new", words: "turn done · new", at });
});

test("fails with the harness error", () => {
	const run = value();
	run.state = "failed";
	run.error = "Command exited 1";
	expect(runLine(run)).toMatchObject({ kind: "failed", words: "failed: Command exited 1", at: null });
});

test("stops after a person stops the run", () => {
	const run = value();
	run.state = "stopped";
	expect(runLine(run)).toMatchObject({ kind: "stopped", words: "stopped", at: null });
});

test("exits after a zero exit code", () => {
	const run = value();
	run.state = "exited";
	run.processStatus = "exited";
	expect(runLine(run)).toMatchObject({ kind: "exited", words: "exited", at: null });
});

test("is lost when no live attempt record exists", () => {
	const run = value();
	run.state = "interrupted";
	run.processStatus = null;
	run.observation = null;
	expect(runLine(run)).toMatchObject({ kind: "lost", words: "lost", at: null });
});
