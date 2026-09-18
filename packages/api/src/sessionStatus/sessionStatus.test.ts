import { expect, test } from "bun:test";
import type { AgentRun } from "../schemas/agentRun.ts";
import { SessionAlerts } from "../sessionAlerts/sessionAlerts.ts";
import { at, session } from "./fixture.ts";
import { sessionStatus } from "./sessionStatus.ts";

const attention = (run: AgentRun) => run.observation!.attention!;

test("working, input, unseen done, and seen idle are distinct", () => {
	const { run } = session();
	expect(sessionStatus(run)).toBe("working");
	attention(run).requests = [{ id: "q", kind: "question", title: "Choose", blocking: true, sequence: 2, at }];
	expect(sessionStatus(run)).toBe("needs-input");
	run.seenAttention = { attemptId: "attempt", sequence: 10 };
	expect(sessionStatus(run)).toBe("needs-input");
	attention(run).requests = [];
	attention(run).completion = { sequence: 11, at };
	run.observation!.outcome = "completed";
	expect(sessionStatus(run)).toBe("done");
	run.seenAttention.sequence = 11;
	expect(sessionStatus(run)).toBe("idle");
	run.seenAttention.attemptId = "previous-attempt";
	expect(sessionStatus(run)).toBe("done");
});

test("disconnected and failed processes cannot show a live question", () => {
	const { run } = session();
	attention(run).requests = [{ id: "q", kind: "question", title: "Choose", blocking: true, sequence: 2, at }];
	run.processStatus = "unknown";
	expect(sessionStatus(run)).toBe("unavailable");
	run.state = "failed";
	expect(sessionStatus(run)).toBe("failed");
	run.state = "stopped";
	expect(sessionStatus(run)).toBe("stopped");
});

test("alerts suppress baseline replay and duplicates, including out-of-order snapshots", () => {
	const value = { run: session().run, sessionId: "session" };
	const alerts = new SessionAlerts();
	attention(value.run).sequence = 3;
	attention(value.run).completion = { sequence: 3, at };
	expect(alerts.update(value, false)).toEqual([]);
	expect(alerts.update(value, true)).toEqual([]);
	attention(value.run).completion = null;
	attention(value.run).requests = [{ id: "q", kind: "question", title: "Choose", blocking: false, sequence: 5, at }];
	expect(alerts.update(value, true).map((alert) => alert.kind)).toEqual(["question"]);
	expect(alerts.update(value, true)).toEqual([]);
	attention(value.run).requests = [];
	attention(value.run).completion = { sequence: 4, at };
	expect(alerts.update(value, true)).toEqual([]);
	attention(value.run).completion = { sequence: 6, at };
	expect(alerts.update(value, true).map((alert) => alert.kind)).toEqual(["completed"]);
	value.run.terminalId = "new-attempt";
	expect(alerts.update(value, true)).toHaveLength(1);
});

test("process exit without a provider failure stays silent", () => {
	const value = { run: session().run, sessionId: "session" };
	value.run.observation = null;
	value.run.state = "failed";
	value.run.processStatus = "exited";
	const alerts = new SessionAlerts();
	expect(alerts.update(value, true)).toEqual([]);
	expect(alerts.update(value, true)).toEqual([]);
});

test("a resolved snapshot prevents a delayed question alert", () => {
	const value = { run: session().run, sessionId: "session" };
	const alerts = new SessionAlerts();
	attention(value.run).sequence = 8;
	expect(alerts.update(value, true)).toEqual([]);
	attention(value.run).sequence = 6;
	attention(value.run).requests = [{ id: "old", kind: "question", title: "Choose", blocking: true, sequence: 6, at }];
	expect(alerts.update(value, true)).toEqual([]);
});
