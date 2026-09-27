import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { TicketAgent } from "./TicketAgent";

const ticket = "TRL-495";
const ticketRunsKey = ["agentRuns", "list", { ticket }];

const run = (id: string, fields: Partial<AgentRun> = {}) =>
	({
		id,
		name: id,
		runtime: "native",
		harness: null,
		kind: "agent",
		projectId: "01M24SPHTX36AJ3VKTNZ263E7V",
		projectKey: "TRL",
		ticketId: "01M3GGE0RM1S38N4ATAG52ACSH",
		ticketIdentifier: ticket,
		ticketTitle: "Keep ticket sessions accessible",
		ticketStatusCategory: "done",
		pinnedAt: null,
		assigned: false,
		state: "stopped",
		processStatus: "exited",
		observation: null,
		workspaceId: id,
		terminalId: `${id}-attempt`,
		url: null,
		error: null,
		sessionId: `${id}-conversation`,
		sessionLost: false,
		activityAt: "2026-09-26T12:00:00.000Z",
		createdAt: "2026-09-26T12:00:00.000Z",
		updatedAt: "2026-09-26T12:00:00.000Z",
		...fields,
	}) as AgentRun;

const appOf = (queryClient: QueryClient) =>
	({
		queryClient,
		client: { agentRuns: { stop: async () => ({ id: "current" }) } },
		orpc: {
			agentRuns: {
				list: {
					queryOptions: () => ({ queryKey: ticketRunsKey, queryFn: async () => [] }),
					key: () => ["agentRuns", "list"],
				},
			},
		},
	}) as unknown as AppContext;

const render = (runs: AgentRun[]) => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(ticketRunsKey, runs);
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={appOf(queryClient)}>
				<TicketAgent ticket={ticket} disabled />
			</AppProvider>
		</QueryClientProvider>,
	);
};

describe("TicketAgent", () => {
	test("opens the assigned session and every prior session of a completed ticket", () => {
		const html = render([
			run("current", { assigned: true, state: "exited", createdAt: "2026-09-27T12:00:00.000Z" }),
			run("prior-two", { createdAt: "2026-09-26T12:00:00.000Z" }),
			run("prior-one", { createdAt: "2026-09-25T12:00:00.000Z" }),
		]);

		expect(html.match(/data-agent-session=/g)).toHaveLength(3);
		expect(html).toContain('data-agent-session="current"');
		expect(html).toContain('data-agent-session="prior-two"');
		expect(html).toContain('data-agent-session="prior-one"');
		expect(html.match(/aria-label="Unassign agent"/g)).toHaveLength(1);
	});
});
