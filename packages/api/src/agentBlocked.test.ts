import { expect, test } from "bun:test";
import { blockedAction, blockedLine } from "./agentBlocked.ts";
import type { AgentBlocked } from "./schemas/agent.ts";

const at = "2026-09-10T10:00:00.000Z";
const blocked = (overrides: Partial<AgentBlocked>): AgentBlocked =>
	({ reason: "folder-trust", path: null, detail: null, at, ...overrides }) as AgentBlocked;

// The person reads one line about the state and one about the action, so
// each reason gives both.
test("every reason gives a line that names the agent and an action", () => {
	const reasons = ["folder-trust", "runner-error", "terminal-exited", "no-register"] as const;
	for (const reason of reasons) {
		const line = blockedLine("CDE-42", blocked({ reason, detail: "superset ws create: boom" }));
		expect(line, reason).toContain("CDE-42");
		expect(blockedAction(blocked({ reason })).length, reason).toBeGreaterThan(0);
	}
});

// The one-click action needs the folder, so the text names it.
test("a folder trust block names the folder when the session recorded one", () => {
	expect(blockedAction(blocked({ path: "/Users/navid/projects/trellis" }))).toBe(
		"Trust /Users/navid/projects/trellis, then start the agent again.",
	);
	expect(blockedAction(blocked({ path: null }))).toContain("Add a trusted folder");
});

// A runner refusal is only useful with what the runner printed.
test("a runner error repeats what the runner printed", () => {
	expect(blockedLine("CDE manager", blocked({ reason: "runner-error", detail: "Project not found" }))).toBe(
		"trellis cannot start CDE manager. Project not found",
	);
});
