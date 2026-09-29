import { expect, test } from "bun:test";
import type { AgentRun, TicketSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { workingTicketIds } from "./workingTicketIds.ts";

test("reads the ticket agent after more tickets than the former global limit", async () => {
	const tickets = Array.from({ length: 1005 }, (_, index) => ({ id: `ticket-${index}` })) as Pick<
		TicketSummary,
		"id"
	>[];
	const last = tickets.at(-1)!;
	const calls: unknown[] = [];
	const working = {
		kind: "agent",
		processStatus: "running",
		observation: {
			controllable: true,
			activity: { state: "working", updatedAt: "2026-09-29T12:00:00.000Z" },
			outcome: null,
		},
	} as AgentRun;
	const client = {
		agentRuns: {
			list: async (input: unknown) => {
				calls.push(input);
				return (input as { ticket: string }).ticket === last.id ? [working] : [];
			},
		},
	} as unknown as TrellisClient;

	expect(await workingTicketIds(client, tickets)).toEqual(new Set([last.id]));
	expect(calls).toHaveLength(1005);
	expect(calls).toContainEqual({ ticket: last.id, assigned: true });
});
