import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "@trellis/ui";
import { useEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PageTabsHost } from "../../../features/shell/PageTabsHost";
import { PageTitle } from "../../../features/shell/PageTitle";
import { ShellFrame } from "../../../features/shell/ShellFrame";
import { Topbar } from "../../../features/shell/Topbar";
import { MachinePressureContext } from "../../../features/sidebar/MachinePressure/MachinePressureProvider";
import { Sidebar } from "../../../features/sidebar/Sidebar";
import { usePageTabsStore } from "../../../stores/pageTabsStore";
import { uiActions } from "../../../stores/uiStore";
import { failure, id, pending, project, timestamp } from "../../pages/fixtures/project";
import { projectResponses } from "../../pages/fixtures/responses";
import { run, session } from "../../pages/fixtures/session";

const atlas = {
	...project,
	key: "ATL",
	slug: "atlas",
	name: "Atlas",
	openEpicCount: 3,
	color: "pine" as const,
};

const reviewProjects = [
	atlas,
	{ ...project, id: id(2), key: "FOR", slug: "forge", name: "Forge", position: 1, color: "rust" as const },
	{
		...project,
		id: id(3),
		key: "CLI",
		slug: "client-libraries",
		name: "Client libraries with duplicate release names",
		position: 2,
		color: "cobalt" as const,
	},
];

const reviewSessions = [
	{ ...session, id: id(501), name: "Release review", projectId: null, projectKey: null, pinnedAt: timestamp },
	{
		...session,
		id: id(502),
		name: "Investigate slow workspace startup after restart",
		projectId: null,
		projectKey: null,
		pinnedAt: null,
	},
	{ ...session, id: id(503), name: "API compatibility checks", projectId: null, projectKey: null, pinnedAt: null },
];

const workingActivity = {
	sessionId: reviewSessions[1]!.id,
	run: {
		...run,
		id: id(601),
		name: reviewSessions[1]!.name,
		projectId: atlas.id,
		projectKey: atlas.key,
		state: "running" as const,
		processStatus: "running" as const,
		terminalId: "storybook-attempt",
		observation: {
			checkedAt: timestamp,
			controllable: true,
			activity: { state: "working" as const, updatedAt: timestamp },
			lastMessage: null,
			lastTool: null,
			outcome: null,
			turnId: "storybook-turn",
		},
	},
};

function Navigation() {
	useEffect(() => {
		const title = document.title;
		document.title = "Navigation · trellis";
		return () => {
			document.title = title;
		};
	}, []);
	return (
		<div className="flex h-full bg-bg text-fg">
			<MachinePressureContext.Provider value={{ machines: [], machinesWithAlerts: [], setDetailsOpen: () => {} }}>
				<Sidebar />
			</MachinePressureContext.Provider>
			<div className="relative flex min-w-0 flex-1 flex-col">
				<PageTabsHost />
				<main className="page-inset flex min-h-0 min-w-0 flex-1 flex-col bg-pane">
					<Topbar>
						<PageTitle parent="Atlas" title="Flow state labels" />
					</Topbar>
					<EmptyState
						variant="page"
						className="page-card"
						title="Flow state labels"
						description="Review the current flow labels and their source evidence."
					/>
				</main>
			</div>
		</div>
	);
}

const seedTabs = () => {
	usePageTabsStore.setState({
		tabs: [
			{ id: "search", url: "/search", title: "Search", pinned: true, backHistory: [], forwardHistory: [] },
			{
				id: "project",
				url: "/p/ATL/epics/flow-state-labels",
				title: "Flow state labels",
				backHistory: [],
				forwardHistory: [],
			},
			{ id: "epics", url: "/p/ATL/epics", title: "Epics", groupId: "work", backHistory: [], forwardHistory: [] },
			{
				id: "reviews",
				url: "/p/ATL/diffs",
				title: "Pull requests",
				groupId: "work",
				backHistory: [],
				forwardHistory: [],
			},
		],
		groups: [{ id: "work", name: "Review", collapsed: false }],
		activeId: "project",
		closedTabs: [],
	});
};

const meta = {
	title: "Pages/Navigation",
	component: Navigation,
	beforeEach: seedTabs,
	parameters: {
		trellis: {
			path: "/p/ATL/epics/flow-state-labels",
			responses: {
				...projectResponses,
				"projects.get": atlas,
				"projects.list": reviewProjects,
				"sessions.list": reviewSessions,
				"agentRuns.activity": [workingActivity],
				"settings.get": {
					menuLinks: [
						{
							id: "engineering-docs",
							label: "Engineering docs",
							url: "https://example.test/docs",
							icon: "BookOpen",
						},
					],
				},
				"system.gh": { ok: true, login: "storybook", error: null },
				"settings.set": (input: unknown) => input,
			},
		},
	},
} satisfies Meta<typeof Navigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("tab", { name: "Navigation" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	},
};
export const Collapsed: Story = {
	beforeEach: () => {
		uiActions.setSidebarCollapsed(true);
	},
};
export const Connecting: Story = { parameters: { trellis: { liveStatus: "connecting" } } };
export const Reconnecting: Story = { parameters: { trellis: { liveStatus: "reconnecting" } } };
export const Restarting: Story = { parameters: { trellis: { liveStatus: "restarting" } } };
export const Offline: Story = { parameters: { trellis: { liveStatus: "down" } } };
export const Empty: Story = { parameters: { trellis: { responses: { "projects.list": [], "sessions.list": [] } } } };
export const Loading: Story = {
	parameters: { trellis: { responses: { "projects.list": pending, "sessions.list": pending } } },
};
export const FailedRequest: Story = {
	parameters: { trellis: { responses: { "projects.list": failure, "sessions.list": failure } } },
};
export const ShellLoading: Story = { render: () => <ShellFrame /> };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const MobileSidebar: Story = {
	globals: { viewport: { value: "phone", isRotated: false } },
	beforeEach: () => {
		uiActions.setMobileSidebarOpen(true);
	},
};
export const ManyProjects: Story = {
	parameters: {
		trellis: {
			responses: {
				"projects.list": Array.from({ length: 20 }, (_, index) => ({
					...project,
					id: `project-${index}`,
					key: `P${index}`,
					name: `Project ${index + 1}`,
					position: index,
				})),
			},
		},
	},
};
export const RenameActor: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: /Storybook/ }));
		await expect(await within(document.body).findByRole("textbox", { name: "Name" })).toHaveValue("Storybook");
	},
};
export const RenamedActor: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: /Storybook/ }));
		const body = within(document.body);
		const name = await body.findByRole("textbox", { name: "Name" });
		await userEvent.clear(name);
		await userEvent.type(name, "Catalog reviewer");
		await userEvent.click(body.getByRole("button", { name: "Rename" }));
		await expect(await within(canvasElement).findByRole("button", { name: /Catalog reviewer/ })).toBeVisible();
		await waitFor(() => expect(body.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument());
	},
};
