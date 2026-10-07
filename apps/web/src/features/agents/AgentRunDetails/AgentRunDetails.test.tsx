import { afterAll, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../lib/appContext";

mock.module("../NativeTerminal", () => ({ NativeTerminal: () => null }));
const { AgentRunDetails } = await import("./AgentRunDetails");
afterAll(() => mock.restore());

const run: AgentRun = {
	id: "run",
	name: "Review the assignment",
	runtime: "native",
	harness: null,
	kind: "agent",
	projectId: "project",
	projectKey: "TRL",
	ticketId: "ticket",
	ticketIdentifier: "TRL-1327",
	ticketTitle: "Review the assignment",
	ticketStatusCategory: "started",
	ticketEpicId: null,
	ticketEpicProjectId: null,
	pinnedAt: null,
	assigned: true,
	state: "stopped",
	processStatus: "exited",
	observation: null,
	workspaceId: "workspace",
	terminalId: "terminal",
	url: null,
	error: null,
	sessionId: "provider-session",
	sessionLost: false,
	activityAt: null,
	createdAt: "2026-09-26T12:00:00.000Z",
	updatedAt: "2026-09-26T12:00:00.000Z",
};

const render = (fields: Partial<AgentRun>) => {
	const queryClient = new QueryClient();
	const queryKey = ["agent-details"];
	const value = { ...run, ...fields };
	queryClient.setQueryData(queryKey, { items: [value], nextCursor: null });
	const app = {
		queryClient,
		client: { agentRuns: { stop: async () => ({ id: run.id }) } },
		orpc: {
			agentRuns: {
				list: {
					queryOptions: () => ({ queryKey, queryFn: async () => ({ items: [value], nextCursor: null }) }),
					key: () => queryKey,
				},
			},
		},
	} as unknown as AppContext;
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<AgentRunDetails run={value} heading />
			</AppProvider>
		</QueryClientProvider>,
	);
};

test("shows a paused ticket assignment without an idle avatar label", () => {
	const html = render({});
	expect(html).toContain(">Paused<");
	expect(html).not.toContain(">Idle<");
	expect(html).not.toContain(" · idle");
});

test("shows a completed ticket assignment as done", () => {
	const html = render({ ticketStatusCategory: "done" });
	expect(html).toContain(">Done<");
	expect(html).not.toContain(">Paused<");
});

test("shows a completed observation as done on an active ticket", () => {
	const html = render({
		observation: {
			checkedAt: run.updatedAt,
			controllable: false,
			activity: null,
			lastMessage: null,
			lastTool: null,
			outcome: "completed",
			turnId: null,
		},
	});
	expect(html).toContain(">Done<");
	expect(html).not.toContain(">Paused<");
});

test.each([
	[{ state: "starting", processStatus: null }, "Starting"],
	[{ state: "failed", error: "The process failed." }, "Failed"],
	[{ assigned: false }, "Idle"],
	[{ kind: "session", ticketId: null }, "Idle"],
] as const)("preserves the canonical detail state for %j", (fields, label) => {
	const html = render(fields);
	expect(html).toContain(`>${label}<`);
	expect(html).not.toContain(">Paused<");
});
