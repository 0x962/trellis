import { afterAll, expect, mock, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { createTrellisClient, type Flow, type FlowExecutionRecord } from "@trellis/api";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../lib/appContext";
import type { StepFields } from "./FlowEditor/flowDraft";

const ui = await import("@trellis/ui");
const Boundary = ({ children }: { children: ReactNode }) => <>{children}</>;
mock.module("@trellis/ui", () => ({ ...ui, Dialog: Boundary, Sheet: Boundary }));

const { FlowDecisionDialog } = await import(
	"../reviews/FlowRuns/components/FlowRun/components/FlowDecisionDialog/FlowDecisionDialog"
);
const { FlowSettingsSheet } = await import("./FlowEditor/components/FlowSettingsSheet/FlowSettingsSheet");
const { NodeInspector } = await import("./FlowEditor/components/NodeInspector/NodeInspector");
const { NewFlowDialog } = await import("./FlowsPage/components/NewFlowDialog/NewFlowDialog");

const queryClient = new QueryClient();
const client = createTrellisClient("http://localhost", () => null);
const orpc = createTanstackQueryUtils(client);
const app = { client, orpc, queryClient } as AppContext;
afterAll(() => {
	queryClient.clear();
	mock.restore();
});
const flow: Flow = {
	id: "01J9Z0000000000000000000F1",
	project: null,
	slug: `flow-${"s".repeat(64)}`,
	name: "n".repeat(121),
	description: "d".repeat(2001),
	briefing: "b".repeat(200_001),
	harness: null,
	version: 1,
	createdAt: "2026-09-29T06:00:00.000Z",
	updatedAt: "2026-09-29T06:00:00.000Z",
};

const withApp = (child: ReactNode) => (
	<QueryClientProvider client={queryClient}>
		<AppProvider value={app}>{child}</AppProvider>
	</QueryClientProvider>
);

test("the new-flow controls have no browser text ceiling", () => {
	const html = renderToStaticMarkup(withApp(<NewFlowDialog onClose={() => {}} onCreated={() => {}} />));

	expect(html).toContain("Name");
	expect(html).toContain("Description");
	expect(html).not.toContain("maxlength=");
});

test("the settings controls retain flow text above the former limits", async () => {
	const rootRoute = createRootRoute({
		component: () => withApp(<FlowSettingsSheet flow={flow} onSaved={() => {}} onClose={() => {}} />),
	});
	const flowRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/ai/flows/$slug",
		component: () => null,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([flowRoute]),
		history: createMemoryHistory({ initialEntries: [`/ai/flows/${flow.slug}`] }),
	});
	await router.load();
	const html = renderToStaticMarkup(<RouterProvider router={router} />);

	for (const value of [flow.slug, flow.name, flow.description, flow.briefing]) expect(html).toContain(value);
	expect(html).not.toContain("maxlength=");
});

const fields = (patch: Partial<StepFields>): StepFields => ({
	id: "01J9Z0000000000000000000N1",
	kind: "group",
	title: "t".repeat(121),
	instruction: "",
	parallel: false,
	minutes: 1441,
	maxRounds: null,
	harness: null,
	...patch,
});

const renderInspector = (initialFields: StepFields) =>
	renderToStaticMarkup(
		<NodeInspector
			fields={initialFields}
			issue={undefined}
			validate={() => ({ canSave: true, issue: undefined })}
			onDelete={() => {}}
			onClose={() => {}}
			onSave={() => {}}
			saving={false}
			canSave
		/>,
	);

test("the node controls retain step text, minutes, and rounds above the former limits", () => {
	const group = renderInspector(fields({}));
	const human = renderInspector(fields({ kind: "human", instruction: "i".repeat(200_001), minutes: null }));
	const loop = renderInspector(fields({ kind: "loop", minutes: null, maxRounds: 51 }));

	expect(group).toContain(fields({}).title);
	expect(group).toMatch(/type="number"[^>]*min="1"[^>]*value="1441"/);
	expect(human).toContain("i".repeat(200_001));
	expect(loop).toMatch(/type="number"[^>]*min="1"[^>]*value="51"/);
	for (const html of [group, human, loop]) {
		expect(html).not.toContain("maxlength=");
		expect(html).not.toContain('max="');
	}
});

test("the human decision control has no browser output ceiling", () => {
	const node = {
		id: "01J9Z0000000000000000000H1",
		parentId: null,
		kind: "human" as const,
		title: "Approve",
		instruction: "Decide.",
		parallel: false,
		minutes: null,
		maxRounds: null,
		x: 0,
		y: 0,
		width: null,
		height: null,
		harness: null,
		reviewArea: null,
	};
	const execution = {
		id: "01J9Z0000000000000000000E1",
		flowId: flow.id,
		ticketId: "01J9Z0000000000000000000T1",
		projectId: "01J9Z0000000000000000000P1",
		revision: 1,
		headSha: null,
		doc: { flow, nodes: [node], edges: [] },
		state: {
			version: 1 as const,
			flowId: flow.id,
			flowVersion: 1,
			status: "waiting" as const,
			startedAt: 1,
			updatedAt: 1,
			error: null,
			steps: [
				{
					key: "human",
					actionKey: "human",
					nodeId: node.id,
					parentKey: null,
					iteration: 0,
					round: 0,
					state: "waiting_human" as const,
					phase: "step" as const,
					output: null,
					decision: null,
					error: null,
					startedAt: 1,
					endedAt: null,
					deadlineAt: null,
					needsStop: false,
				},
			],
		},
		tasks: [],
		createdAt: "2026-09-29T06:00:00.000Z",
		updatedAt: "2026-09-29T06:00:00.000Z",
	} satisfies FlowExecutionRecord;
	const html = renderToStaticMarkup(
		withApp(<FlowDecisionDialog execution={execution} actionKey="human" onClose={() => {}} />),
	);

	expect(html).toContain("Decision notes");
	expect(html).not.toContain("maxlength=");
});
