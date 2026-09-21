import { describe, expect, test } from "bun:test";
import type { AgentRun, Ticket } from "@trellis/api";
import { canRetryRun, canStartRun } from "./RunBlock";

const ticket = (completedAt: string | null) => ({ completedAt }) as Pick<Ticket, "completedAt">;

const run = (fields: Partial<AgentRun> = {}) =>
	({
		id: "01J00000000000000000000000",
		name: "Agent",
		kind: "agent",
		runtime: "native",
		harness: null,
		instruction: "",
		projectId: "project",
		projectPath: "TRL",
		ticketId: "ticket",
		ticketIdentifier: "TRL-251",
		ticketTitle: "Fix retry",
		ticketStatusCategory: "todo",
		assigned: true,
		state: "interrupted",
		processStatus: null,
		observation: null,
		workspaceId: null,
		terminalId: "attempt",
		url: null,
		error: "The execution service has no live record of this attempt.",
		sessionId: null,
		sessionLost: false,
		createdAt: "2026-09-21T10:00:00Z",
		updatedAt: "2026-09-21T10:00:00Z",
		...fields,
	}) as AgentRun;

describe("run actions", () => {
	test("Start is hidden for completed tickets and assigned agents", () => {
		expect(canStartRun(ticket(null), [])).toBeTrue();
		expect(canStartRun(ticket("2026-09-21T10:00:00Z"), [])).toBeFalse();
		expect(canStartRun(ticket(null), [run()])).toBeFalse();
	});

	test("Retry is live only for an assigned failed or lost agent attempt", () => {
		expect(canRetryRun(run())).toBeTrue();
		expect(canRetryRun(run({ assigned: false }))).toBeFalse();
		expect(canRetryRun(run({ terminalId: null }))).toBeFalse();
		expect(
			canRetryRun(
				run({
					state: "running",
					processStatus: "running",
					error: null,
					observation: {
						checkedAt: "2026-09-21T10:00:00Z",
						controllable: true,
						activity: { state: "working", updatedAt: "2026-09-21T10:00:00Z" },
						lastMessage: null,
						lastTool: null,
						outcome: null,
						turnId: "turn",
						attention: { sequence: 1, requests: [], completion: null, failure: null },
					},
				}),
			),
		).toBeFalse();
	});
});
