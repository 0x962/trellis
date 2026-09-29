import { expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { workingTicketIds } from "./workingTicketIds.ts";

test("reads the bounded latest runs for epic tickets", async () => {
	const lastTicketId = "01M3Q1B2C3D4E5F6G7H8J9K0LM";
	const calls: unknown[] = [];
	const working = {
		kind: "agent",
		ticketId: lastTicketId,
		processStatus: "running",
		observation: {
			controllable: true,
			activity: { state: "working", updatedAt: "2026-09-29T12:00:00.000Z" },
			outcome: null,
		},
	} as AgentRun;
	const closed = {
		...working,
		ticketId: "01M3Q1B2C3D4E5F6G7H8J9K0LN",
		processStatus: "exited",
	} as AgentRun;
	const client = {
		agentRuns: {
			latestByEpicTicket: async (input: unknown) => {
				calls.push(input);
				return [working, closed];
			},
		},
	} as unknown as TrellisClient;

	expect(await workingTicketIds(client, "TRL/large-epic")).toEqual(new Set([lastTicketId]));
	expect(calls).toEqual([{ epic: "TRL/large-epic" }]);
});
