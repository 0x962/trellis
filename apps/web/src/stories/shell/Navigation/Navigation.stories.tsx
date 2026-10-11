import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState, type MachinePressureMachineView } from "@trellis/ui";
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
	{ ...session, id: id(504), name: "Release review", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(505), name: "Inspect the phone navigation", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(506), name: "Verify page tabs and Back", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(507), name: "Review connection warnings", projectId: null, projectKey: null, pinnedAt: null },
	{ ...session, id: id(508), name: "Check project menus", projectId: null, projectKey: null, pinnedAt: null },
];

const sessionActivity = {
	sessionId: reviewSessions[1]!.id,
	run: {
		...run,
		id: id(601),
		name: reviewSessions[1]!.name,
		projectId: null,
		projectKey: "",
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

const projectActivity = {
	sessionId: null,
	run: {
		...run,
		id: id(602),
		name: "Review Atlas flow labels",
		projectId: atlas.id,
		projectKey: atlas.key,
		state: "running" as const,
		processStatus: "running" as const,
		terminalId: "storybook-project-attempt",
		observation: {
			checkedAt: timestamp,
			controllable: true,
			activity: { state: "working" as const, updatedAt: timestamp },
			lastMessage: null,
			lastTool: null,
			outcome: null,
			turnId: "storybook-project-turn",
		},
	},
};

const pressureMachine: MachinePressureMachineView = {
	id: "storybook-host",
	name: "Synthetic host",
	readings: [
		{
			key: "cpuLoad",
			label: "CPU load",
			value: "2.4",
			unit: "per core",
			tone: "warning",
			freshness: "live",
		},
		{
			key: "memory",
			label: "Memory pressure",
			value: "Critical",
			tone: "danger",
			freshness: "live",
		},
	],
};

function Navigation({ machineAlert = false }: { machineAlert?: boolean }) {
	useEffect(() => {
		const title = document.title;
		document.title = "Navigation · trellis";
		return () => {
			document.title = title;
		};
	}, []);
	return (
		<div className="flex h-full bg-bg text-fg">
			<MachinePressureContext.Provider
				value={{
					machines: machineAlert ? [pressureMachine] : [],
					machinesWithAlerts: machineAlert ? [pressureMachine] : [],
					setDetailsOpen: () => {},
				}}
			>
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
				"agentRuns.activity": [sessionActivity, projectActivity],
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
				"system.gh": { ok: true, user: "storybook", reason: null, message: null, checkedAt: timestamp },
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
export const NestedRouteFocus: Story = {
	play: async ({ canvasElement }) => {
		const epics = canvasElement.querySelector<HTMLAnchorElement>('a[href="/p/ATL/epics"]')!;
		const sessions = canvasElement.querySelector<HTMLAnchorElement>('a[href="/sessions/project/ATL"]')!;
		sessions.focus();
		await expect(sessions).toHaveFocus();
		await expect(epics).toHaveAttribute("aria-current", "page");
	},
};
export const GlobalReview: Story = {
	parameters: { trellis: { path: "/reviews/example/trellis/42" } },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector(".sidebar-selected")).not.toBeInTheDocument();
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
export const GitHubWarning: Story = {
	parameters: {
		trellis: {
			responses: {
				"system.gh": {
					ok: false,
					user: null,
					reason: "unauthenticated",
					message: "Sign in to GitHub.",
					checkedAt: timestamp,
				},
			},
		},
	},
};
export const MachineAlert: Story = { args: { machineAlert: true } };
export const Empty: Story = { parameters: { trellis: { responses: { "projects.list": [], "sessions.list": [] } } } };
export const Loading: Story = {
	parameters: { trellis: { responses: { "projects.list": pending, "sessions.list": pending } } },
};
export const FailedRequest: Story = {
	parameters: { trellis: { responses: { "projects.list": failure, "sessions.list": failure } } },
};
export const ShellLoading: Story = { render: () => <ShellFrame /> };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const Narrow320: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "tablet", isRotated: false } } };
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
					name:
						index % 5 === 0
							? "Client libraries with duplicate release names"
							: index % 3 === 0
								? "Release review"
								: `Project ${index + 1}`,
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
