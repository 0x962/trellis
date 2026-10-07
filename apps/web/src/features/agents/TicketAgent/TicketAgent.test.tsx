import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type AgentRun, HarnessSchema } from "@trellis/api";
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
	return renderClient(queryClient);
};

const renderClient = (queryClient: QueryClient) => {
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={appOf(queryClient)}>
				<TicketAgent ticket={ticket} disabled />
			</AppProvider>
		</QueryClientProvider>,
	);
};

describe("TicketAgent", () => {
	test("shows distinct run names with secondary harness and model details", () => {
		const harness = HarnessSchema.parse({ preset: "codex", model: "openai/gpt-6-astra" });
		const html = render([
			run("current", { assigned: true, name: "Scout alpha", harness }),
			run("prior", { name: "Scout beta", harness }),
		]);

		expect(html).toMatch(/<p[^>]*>Scout alpha<\/p>/);
		expect(html).toMatch(/<p[^>]*>Scout beta<\/p>/);
		expect(html).toContain("Codex · GPT-6 Astra");
	});

	test.each(["stopped", "exited"] as const)("labels an assigned %s process as paused", (state) => {
		const html = render([run("current", { assigned: true, state, ticketStatusCategory: "started" })]);

		expect(html).toContain(">Paused<");
		expect(html).not.toContain(">Idle<");
		expect(html).not.toContain(" · idle");
	});

	test("labels a stopped assignment on a done ticket as done", () => {
		const html = render([run("current", { assigned: true })]);

		expect(html).toContain(">Done<");
		expect(html).not.toContain(">Paused<");
	});

	test("labels a completed observation as done before the ticket status changes", () => {
		const html = render([
			run("current", {
				assigned: true,
				ticketStatusCategory: "started",
				observation: {
					checkedAt: "2026-09-26T12:00:00.000Z",
					controllable: false,
					activity: null,
					lastMessage: null,
					lastTool: null,
					outcome: "completed",
					turnId: null,
				},
			}),
		]);

		expect(html).toContain(">Done<");
		expect(html).not.toContain(">Paused<");
	});

	test("does not label a canceled ticket assignment as paused", () => {
		const html = render([run("current", { assigned: true, ticketStatusCategory: "canceled" })]);

		expect(html).toContain(">Idle<");
		expect(html).not.toContain(">Paused<");
	});

	test("does not label a live assigned process as paused", () => {
		const html = render([run("current", { assigned: true, state: "running", processStatus: "running" })]);

		expect(html).not.toContain(">Paused<");
	});

	test("retains the assignment and history after a background read fails", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(ticketRunsKey, [run("current", { assigned: true }), run("prior")]);
		await expect(
			queryClient.fetchQuery({
				queryKey: ticketRunsKey,
				queryFn: async () => {
					throw new Error("The background read failed.");
				},
				retry: false,
			}),
		).rejects.toThrow("The background read failed.");

		const html = renderClient(queryClient);
		expect(html).toContain("The agents did not refresh");
		expect(html).toContain('data-agent-session="current"');
		expect(html).toContain('data-agent-session="prior"');
		expect(html).toContain('aria-label="Unassign agent"');
		expect(html).toContain(">Retry<");
	});

	test("keeps a visible failure state for an unassigned historical run", () => {
		const html = render([
			run("current", { assigned: true }),
			run("prior-failed", { state: "failed", error: "The previous process failed." }),
		]);

		expect(html).toContain('data-agent-session="prior-failed"');
		expect(html).toContain(">Failed<");
		expect(html).toContain('dateTime="2026-09-26T12:00:00.000Z"');
	});

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
