import { expect, test } from "bun:test";
import type { AgentRun } from "../schemas/agentRun.ts";
import { at, session } from "../sessionStatus/fixture.ts";
import { isAgentWorking, runLine } from "./runLine.ts";

const namedRun = () => {
	const run = session().run;
	run.name = "crisp-fjord";
	return run;
};

const attention = (run: AgentRun) => run.observation!.attention!;

test("starts from a launch without a process", () => {
	const run = namedRun();
	run.state = "starting";
	run.processStatus = null;
	run.observation = null;
	expect(runLine(run)).toMatchObject({ kind: "starts", words: "starts", since: null });
});

test("works with the current tool and its start time", () => {
	const run = namedRun();
	run.observation!.lastTool = { name: "Edit", status: "running", startedAt: at, updatedAt: at };
	attention(run).completion = { sequence: 1, at };
	run.seenAttention = { attemptId: "attempt", sequence: 1 };
	expect(runLine(run)).toMatchObject({ kind: "works", words: "works, tool Edit", since: at });
});

test("works without a current tool", () => {
	const run = namedRun();
	expect(runLine(run)).toMatchObject({ kind: "works", words: "works", since: at });
});

test("identifies a controllable working process", () => {
	const run = namedRun();
	expect(isAgentWorking(run)).toBeTrue();
	attention(run).requests = [
		{ id: "permission", kind: "permission", title: "Approve Bash", blocking: true, sequence: 2, at },
	];
	expect(isAgentWorking(run)).toBeTrue();
	run.observation!.activity = { state: "idle", updatedAt: at };
	expect(isAgentWorking(run)).toBeFalse();
});

test("adds the last message as the second line", () => {
	const run = namedRun();
	run.observation!.lastMessage = { text: "The cap is in settings.", at };
	expect(runLine(run).lastMessage).toEqual({ words: "crisp-fjord: The cap is in settings.", at });
});

test("asks with the harness question text", () => {
	const run = namedRun();
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
	expect(runLine(run)).toMatchObject({ kind: "question", words: "asks: Which cap?", since: at });
});

test("asks to run a permission tool", () => {
	const run = namedRun();
	attention(run).requests = [
		{ id: "permission", kind: "permission", title: "Approve Bash", blocking: true, sequence: 2, at },
	];
	expect(runLine(run)).toMatchObject({ kind: "permission", words: "asks to run: Bash", since: at });
});

test("asks for an elicitation field", () => {
	const run = namedRun();
	attention(run).requests = [
		{ id: "elicitation", kind: "elicitation", title: "Project name", blocking: true, sequence: 2, at },
	];
	expect(runLine(run)).toMatchObject({ kind: "elicitation", words: "asks: Project name", since: at });
});

test("idles from the activity signal", () => {
	const run = namedRun();
	run.observation!.activity = { state: "idle", updatedAt: at };
	expect(runLine(run)).toMatchObject({ kind: "idle", words: "idle", since: at });
	run.observation!.activity = null;
	expect(runLine(run)).toMatchObject({ kind: "idle", words: "idle", since: null });
});

test("shows a seen completion as turn done", () => {
	const run = namedRun();
	run.observation!.activity = { state: "idle", updatedAt: at };
	run.observation!.outcome = "completed";
	attention(run).completion = { sequence: 2, at };
	run.seenAttention = { attemptId: "attempt", sequence: 2 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done", words: "turn done", since: at });
});

test("shows a completion from an earlier attempt marker as new", () => {
	const run = namedRun();
	run.observation!.activity = { state: "idle", updatedAt: at };
	run.observation!.outcome = "completed";
	attention(run).completion = { sequence: 2, at };
	run.seenAttention = { attemptId: "attempt", sequence: 1 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done-new", words: "turn done · new", since: at });
	run.seenAttention = { attemptId: "earlier-attempt", sequence: 9 };
	expect(runLine(run)).toMatchObject({ kind: "turn-done-new", words: "turn done · new", since: at });
});

test("fails with the harness error", () => {
	const run = namedRun();
	run.state = "failed";
	run.error = "Command exited 1";
	expect(runLine(run)).toMatchObject({
		kind: "failed",
		words: "failed: Command exited 1",
		since: null,
		rawError: null,
	});
});

test("keeps a runtime socket error behind details", () => {
	const run = namedRun();
	run.state = "failed";
	run.error = "connect ENOENT /var/folders/example/runtime.sock";
	expect(runLine(run)).toMatchObject({
		kind: "failed",
		words: "did not run: Trellis could not reach the execution service",
		since: null,
		rawError: "connect ENOENT /var/folders/example/runtime.sock",
	});
});

test("stops after a person stops the run", () => {
	const run = namedRun();
	run.state = "stopped";
	expect(runLine(run)).toMatchObject({ kind: "stopped", words: "stopped", since: null });
});

test("exits after a zero exit code", () => {
	const run = namedRun();
	run.processStatus = "exited";
	expect(runLine(run)).toMatchObject({ kind: "exited", words: "exited", since: null });
});

test("is lost when no live attempt record exists", () => {
	const run = namedRun();
	run.state = "interrupted";
	run.processStatus = null;
	run.observation = null;
	expect(runLine(run)).toMatchObject({
		kind: "lost",
		words: "did not run: Trellis cannot find a live execution record",
		since: null,
	});
});
