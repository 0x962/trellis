import { expect, test } from "bun:test";
import type { AgentRun } from "../schemas/agentRun.ts";
import { session } from "./fixture.ts";
import { sessionStatus, sessionStatusLabels } from "./sessionStatus.ts";

const assigned = (patch: Partial<AgentRun> = {}): AgentRun => ({
	...session().run,
	kind: "agent",
	ticketId: "ticket",
	ticketStatusCategory: "started",
	state: "stopped",
	processStatus: "exited",
	observation: null,
	...patch,
});

test("an assigned ticket keeps Paused across a stopped or exited process", () => {
	for (const state of ["stopped", "exited"] as const) {
		expect(sessionStatus(assigned({ state }))).toBe("paused");
	}
	expect(sessionStatusLabels[sessionStatus(assigned())]).toBe("Paused");
});

test("a completed ticket or observed outcome keeps Done after process exit", () => {
	expect(sessionStatus(assigned({ ticketStatusCategory: "done" }))).toBe("done");
	expect(sessionStatus(assigned({ observation: { ...session().run.observation!, outcome: "completed" } }))).toBe(
		"done",
	);
});

test("ordinary sessions, closed assignments, and canceled tickets retain Idle", () => {
	for (const patch of [
		{ kind: "session" as const, ticketId: null },
		{ assigned: false },
		{ ticketId: null },
		{ ticketStatusCategory: "canceled" as const },
		{ error: "The process did not start." },
	]) {
		expect(sessionStatus(assigned(patch))).toBe("idle");
	}
});

test("a live, unknown, or failed process does not become Paused", () => {
	expect(sessionStatus(assigned({ state: "failed" }))).toBe("failed");
	for (const processStatus of ["running", "unknown"] as const) {
		expect(sessionStatus(assigned({ processStatus }))).toBe("idle");
	}
	for (const outcome of ["failed", "interrupted"] as const) {
		expect(sessionStatus(assigned({ observation: { ...session().run.observation!, outcome } }))).toBe("idle");
	}
});
