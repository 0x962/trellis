import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import type { LinkPress } from "@trellis/ui";
import { sessionStatusProcessState, sessionUpdateInput, statusLinkPress } from "./sessionStatusState";

const run = (fields: Partial<AgentRun> = {}) =>
	({
		id: "01M3NTSQFE0SNHV14Q5YNX8M2T",
		name: "Agent",
		runtime: "native",
		harness: null,
		kind: "agent",
		projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
		projectKey: "TRL",
		ticketId: "01M3NTSQFE0SNHV14Q5YNX8M2T",
		ticketIdentifier: "TRL-655",
		ticketTitle: "Show saved agent updates in every session",
		ticketStatusCategory: "started",
		pinnedAt: null,
		assigned: true,
		state: "running",
		processStatus: "running",
		observation: null,
		workspaceId: "workspace",
		terminalId: "attempt",
		url: null,
		error: null,
		sessionId: "provider-session",
		sessionLost: false,
		activityAt: "2026-09-29T06:00:00.000Z",
		createdAt: "2026-09-29T05:00:00.000Z",
		updatedAt: "2026-09-29T06:00:00.000Z",
		...fields,
	}) as AgentRun;

describe("session status state", () => {
	test("uses the run identity for ticket and standalone update queries", () => {
		expect(sessionUpdateInput(run({ id: "ticket-run", kind: "agent" }))).toEqual({ sessionId: "ticket-run" });
		expect(sessionUpdateInput(run({ id: "standalone-run", kind: "session" }))).toEqual({ sessionId: "standalone-run" });
	});

	test("keeps completed work distinct from active and paused work", () => {
		expect(sessionStatusProcessState(run())).toBe("active");
		expect(sessionStatusProcessState(run({ state: "starting", processStatus: null }))).toBe("active");
		expect(sessionStatusProcessState(run({ processStatus: "exited" }))).toBe("paused");
		expect(sessionStatusProcessState(run({ ticketStatusCategory: "done" }))).toBe("completed");
		expect(
			sessionStatusProcessState(
				run({
					observation: {
						checkedAt: "now",
						controllable: false,
						activity: null,
						lastMessage: null,
						lastTool: null,
						outcome: "completed",
						turnId: null,
					},
				}),
			),
		).toBe("completed");
	});

	test("maps a new-window target to the public link callback", () => {
		const press: LinkPress = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };
		expect(statusLinkPress("_blank", press)).toEqual({ ...press, metaKey: true });
		expect(statusLinkPress("", press)).toBe(press);
	});
});
