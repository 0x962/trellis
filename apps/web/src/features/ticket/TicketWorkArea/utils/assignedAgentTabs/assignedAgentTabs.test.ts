import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { assignedAgentTabs } from "./assignedAgentTabs";

const run = (id: string, personaName: string, processStatus: AgentRun["processStatus"]): AgentRun => ({
	id,
	name: personaName,
	runtime: "native",
	personaId: "01K00000000000000000000001",
	personaName,
	kind: "builder",
	instruction: "Build the ticket.",
	projectId: "01K00000000000000000000002",
	projectPath: "TRL",
	ticketId: "01K00000000000000000000003",
	ticketIdentifier: "TRL-87",
	state: "running",
	processStatus,
	observation: null,
	workspaceId: "/tmp/trellis-agent-tab",
	terminalId: `attempt-${id}`,
	url: null,
	error: null,
	sessionId: null,
	sessionLost: false,
	createdAt: "2026-09-16T12:00:00.000Z",
	updatedAt: "2026-09-16T12:00:00.000Z",
});

describe("assignedAgentTabs", () => {
	test("keeps one stable tab per assigned run and numbers duplicate persona names", () => {
		expect(
			assignedAgentTabs([
				run("01K00000000000000000000011", "Senior Software Engineer", "running"),
				run("01K00000000000000000000012", "Senior Software Engineer", "unknown"),
				run("01K00000000000000000000013", "Release Engineer", "exited"),
			]),
		).toEqual([
			{
				value: "agent:01K00000000000000000000011",
				label: "Senior Software Engineer 1",
				run: expect.objectContaining({ id: "01K00000000000000000000011" }),
			},
			{
				value: "agent:01K00000000000000000000012",
				label: "Senior Software Engineer 2",
				run: expect.objectContaining({ id: "01K00000000000000000000012" }),
			},
		]);
	});
});
