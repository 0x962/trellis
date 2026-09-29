import { expect, test } from "bun:test";
import type { AgentRun, TrellisClient } from "@trellis/api";
import { allAgentRuns } from "./allAgentRuns";

test("reads each agent run page in order", async () => {
	const first = { id: "first" } as AgentRun;
	const second = { id: "second" } as AgentRun;
	const calls: unknown[] = [];
	const client = {
		agentRuns: {
			list: async (input: unknown) => {
				calls.push(input);
				return calls.length === 1 ? { items: [first], nextCursor: "next" } : { items: [second], nextCursor: null };
			},
		},
	} as unknown as TrellisClient;

	expect(await allAgentRuns(client, { project: "TRL", allHistory: true, limit: 1 })).toEqual([first, second]);
	expect(calls).toEqual([
		{ project: "TRL", allHistory: true, limit: 1, cursor: undefined },
		{ project: "TRL", allHistory: true, limit: 1, cursor: "next" },
	]);
});
