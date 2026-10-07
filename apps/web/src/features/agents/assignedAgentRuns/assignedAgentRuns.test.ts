import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { AGENT_RUN_LIST_MAX_LIMIT, type AgentRun, type AgentRunListOutput, type TrellisClient } from "@trellis/api";
import type { Orpc } from "../../../lib/orpc";
import { assignedAgentRunsOptions } from "./assignedAgentRuns";

const queryKey = ["agentRuns", "list", { assigned: true }];
const orpc = {
	agentRuns: { list: { queryOptions: () => ({ queryKey }) } },
} as unknown as Orpc;

test("the assignment query waits for every page before it confirms a ticket has no agent", async () => {
	const firstPage = Array.from(
		{ length: AGENT_RUN_LIST_MAX_LIMIT },
		(_, index) => ({ id: `run-${index}` }) as AgentRun,
	);
	const assigned = { id: "last-run", kind: "agent", ticketId: "last-ticket" } as AgentRun;
	let finishPage!: (value: AgentRunListOutput) => void;
	const secondPage = new Promise<AgentRunListOutput>((resolve) => {
		finishPage = resolve;
	});
	const calls: unknown[] = [];
	const client = {
		agentRuns: {
			list: async (input: { cursor?: string }) => {
				calls.push(input);
				return input.cursor === undefined ? { items: firstPage, nextCursor: "second" } : secondPage;
			},
		},
	} as unknown as TrellisClient;
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const pending = queryClient.fetchQuery(assignedAgentRunsOptions(orpc, client));
	await Promise.resolve();
	expect(queryClient.getQueryData(queryKey)).toBeUndefined();
	finishPage({ items: [assigned], nextCursor: null });
	const result = await pending;
	expect(result.items).toHaveLength(AGENT_RUN_LIST_MAX_LIMIT + 1);
	expect(result.items.find((run) => run.ticketId === "last-ticket")).toBe(assigned);
	expect(result.nextCursor).toBeNull();
	expect(calls).toEqual([
		{ assigned: true, limit: AGENT_RUN_LIST_MAX_LIMIT, cursor: undefined },
		{ assigned: true, limit: AGENT_RUN_LIST_MAX_LIMIT, cursor: "second" },
	]);
	queryClient.clear();
});

test("a failed later page preserves the last complete assignment list", async () => {
	const retained = { items: [{ id: "retained" } as AgentRun], nextCursor: null };
	const client = {
		agentRuns: {
			list: async (input: { cursor?: string }) => {
				if (input.cursor !== undefined) throw new Error("The next page did not load.");
				return { items: [], nextCursor: "second" };
			},
		},
	} as unknown as TrellisClient;
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	queryClient.setQueryData<AgentRunListOutput>(queryKey, retained);
	await expect(queryClient.fetchQuery(assignedAgentRunsOptions(orpc, client))).rejects.toThrow(
		"The next page did not load.",
	);
	expect(queryClient.getQueryData<AgentRunListOutput>(queryKey)).toEqual(retained);
	queryClient.clear();
});
