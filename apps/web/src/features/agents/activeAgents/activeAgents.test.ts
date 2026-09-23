import { describe, expect, test } from "bun:test";
import { activeAgentCounts, activeAgentsLabel } from "./activeAgents";

describe("activeAgentCounts", () => {
	test("counts a starting, a working and a waiting agent per project", () => {
		expect(
			activeAgentCounts([
				{ projectId: "p1", status: "working" },
				{ projectId: "p1", status: "starting" },
				{ projectId: "p1", status: "needs-input" },
				{ projectId: "p2", status: "working" },
			]),
		).toEqual([
			{ projectId: "p1", activeCount: 3 },
			{ projectId: "p2", activeCount: 1 },
		]);
	});

	test("leaves out an agent that stopped or cannot be reached", () => {
		expect(
			activeAgentCounts([
				{ projectId: "p1", status: "idle" },
				{ projectId: "p1", status: "done" },
				{ projectId: "p1", status: "failed" },
				{ projectId: "p1", status: "interrupted" },
				{ projectId: "p1", status: "unavailable" },
			]),
		).toEqual([]);
	});

	test("leaves out a run that belongs to no project", () => {
		expect(activeAgentCounts([{ projectId: null, status: "working" }])).toEqual([]);
	});

	test("sorts the rows by project id", () => {
		expect(
			activeAgentCounts([
				{ projectId: "p2", status: "working" },
				{ projectId: "p1", status: "working" },
			]).map((row) => row.projectId),
		).toEqual(["p1", "p2"]);
	});
});

describe("activeAgentsLabel", () => {
	test("says one agent in the singular", () => {
		expect(activeAgentsLabel(1)).toBe("1 agent is active");
	});

	test("says more agents in the plural", () => {
		expect(activeAgentsLabel(3)).toBe("3 agents are active");
	});
});
