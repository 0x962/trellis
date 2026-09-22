import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ActorRef, type AgentRun, HarnessSchema } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { ActorAvatar } from "./ActorAvatar";

const assignedQueryKey = ["agentRuns", "list", { assigned: true }];

const appOf = (queryClient: QueryClient) =>
	({
		queryClient,
		orpc: {
			agentRuns: {
				list: {
					queryOptions: () => ({
						queryKey: assignedQueryKey,
						queryFn: async () => [],
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
	instruction: "Work on TRL-281.",
	projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
	projectPath: "TRL",
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

const defaultActor: ActorRef = { kind: "agent", name: "crisp-fjord", displayName: "Agent" };

const render = (runs: AgentRun[], actor: ActorRef = defaultActor) => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(assignedQueryKey, runs);
	const app = appOf(queryClient);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<ActorAvatar actor={actor} ticketId="01M334MED9Z2GKBXMB6MVTED50" />
			</AppProvider>
		</QueryClientProvider>,
	);
};

describe("ActorAvatar", () => {
	test("draws no avatar for an agent actor when no agent run is assigned", () => {
		expect(render([])).toBe("");
	});

	test("keeps human initials when no agent run is assigned", () => {
		const html = render([], { kind: "human", name: "Navid Khan" });

		expect(html).toContain("NK");
	});

	test("draws the provider mark for an assigned agent run", () => {
		const html = render([crispFjord]);

		expect(html).toContain('data-provider="openai"');
		expect(html).toContain("GPT-6 Astra");
		expect(html).toContain("Max");
	});
});
