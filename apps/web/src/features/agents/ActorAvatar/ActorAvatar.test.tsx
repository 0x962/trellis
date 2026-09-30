import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema, type TicketSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { ActorAvatar } from "./ActorAvatar";

const assignedQueryKey = ["agentRuns", "list", { assigned: true }];

const appOf = (queryClient: QueryClient) =>
	({
		queryClient,
		orpc: {
			projects: { list: { queryOptions: () => ({ queryKey: ["archived"], queryFn: async () => [] }) } },
			harnessAccounts: { list: { queryOptions: () => ({ queryKey: ["accounts"], queryFn: async () => [] }) } },
			agentRuns: {
				list: {
					queryOptions: () => ({
						queryKey: assignedQueryKey,
						queryFn: async () => ({ items: [], nextCursor: null }),
					}),
				},
			},
		},
	}) as unknown as AppContext;

const crispFjord = {
	id: "01M334MEJNF3VS097DC6BS1BZ4",
	name: "crisp-fjord",
	runtime: "native",
	harness: HarnessSchema.parse({ preset: "codex", model: "openai/gpt-6-astra", effort: "max" }),
	kind: "agent",
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	projectKey: "TRL",
	ticketId: "01M334MED9Z2GKBXMB6MVTED50",
	ticketIdentifier: "TRL-281",
	ticketTitle: "Draw no agent avatar on a ticket that no agent holds",
	ticketStatusCategory: "started",
	assigned: true,
	state: "running",
	processStatus: "running",
	observation: { activity: { state: "working", updatedAt: "2026-09-21T23:26:05.825Z" } },
	workspaceId: "01M334MEJNF3VS097DC6BS1BZ4",
	terminalId: "01M334MEJNF3VS097DC6BS1BZ4",
	url: null,
	error: null,
	sessionId: "crisp-fjord",
	sessionLost: false,
	createdAt: "2026-09-21T23:25:48.313Z",
	updatedAt: "2026-09-21T23:26:05.825Z",
} as AgentRun;

const ticket = {
	id: crispFjord.ticketId,
	identifier: "TRL-281",
	status: { category: "todo" },
	project: { key: "TRL" },
	completedAt: null,
} as TicketSummary;

const render = (runs: AgentRun[] | undefined, category = "todo", archived: boolean | null = false) => {
	const queryClient = new QueryClient();
	if (runs !== undefined) queryClient.setQueryData(assignedQueryKey, { items: runs, nextCursor: null });
	if (archived !== null) queryClient.setQueryData(["archived"], archived ? [{ key: "TRL" }] : []);
	const app = appOf(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<ActorAvatar
					ticket={{
						...ticket,
						status: { ...ticket.status, category: category as TicketSummary["status"]["category"] },
					}}
				/>
			</AppProvider>
		</QueryClientProvider>,
	);
};

describe("ActorAvatar", () => {
	test("offers a start after the assignment query confirms an unassigned ticket", () => {
		expect(render([])).toContain('aria-label="Start TRL-281"');
		expect(render(undefined)).not.toContain('aria-label="Start TRL-281"');
		expect(render([], "todo", null)).not.toContain('aria-label="Start TRL-281"');
	});

	test("keeps completed and archived tickets read only", () => {
		expect(render([], "done")).not.toContain('aria-label="Start TRL-281"');
		expect(render([], "canceled")).not.toContain('aria-label="Start TRL-281"');
		expect(render([], "todo", true)).not.toContain('aria-label="Start TRL-281"');
	});

	test("marks an agent that starts apart from one that sits idle", () => {
		const idle = { ...crispFjord, observation: null, processStatus: "exited" } as AgentRun;
		const starting = { ...crispFjord, state: "starting", processStatus: null, observation: null } as AgentRun;

		expect(render([idle])).not.toContain("animate-pulse-live");
		expect(render([starting])).toContain("animate-pulse-live");
		expect(render([starting])).toContain("crisp-fjord · agent · GPT-6 Astra · Max · starting");
	});

	test("draws the provider mark for an assigned agent run", () => {
		const html = render([crispFjord]);

		expect(html).toContain('data-provider="openai"');
		expect(html).toContain("GPT-6 Astra");
		expect(html).toContain("Max");
		expect(html).not.toContain('aria-label="Start TRL-281"');
	});
});
