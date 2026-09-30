import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { PageTabsHost } from "../../../features/shell/PageTabsHost";
import { PageTitle } from "../../../features/shell/PageTitle";
import { ShellFrame } from "../../../features/shell/ShellFrame";
import { Topbar } from "../../../features/shell/Topbar";
import { MachinePressureContext } from "../../../features/sidebar/MachinePressure/MachinePressureProvider";
import { Sidebar } from "../../../features/sidebar/Sidebar";
import { usePageTabsStore } from "../../../stores/pageTabsStore";
import { uiActions } from "../../../stores/uiStore";
import { failure, pending, project } from "../../pages/fixtures/project";
import { projectResponses } from "../../pages/fixtures/responses";
import { session } from "../../pages/fixtures/session";

function Navigation() {
	return (
		<div className="flex h-full bg-bg text-fg">
			<MachinePressureContext.Provider value={{ machines: [], machinesWithAlerts: [], setDetailsOpen: () => {} }}>
				<Sidebar />
			</MachinePressureContext.Provider>
			<div className="relative flex min-w-0 flex-1 flex-col">
				<PageTabsHost />
				<main className="page-inset flex min-h-0 min-w-0 flex-1 flex-col bg-pane">
					<Topbar>
						<PageTitle parent="Trellis workspace" title="Navigation" />
					</Topbar>
					<EmptyState
						variant="page"
						className="page-card"
						title="Explore the workspace"
						description="Use the sidebar and tabs to inspect navigation controls."
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
			{ id: "project", url: "/p/DEMO", title: "Trellis workspace", backHistory: [], forwardHistory: [] },
			{ id: "epics", url: "/p/DEMO/epics", title: "Epics", groupId: "work", backHistory: [], forwardHistory: [] },
			{
				id: "reviews",
				url: "/p/DEMO/diffs",
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
			path: "/p/DEMO",
			responses: {
				...projectResponses,
				"sessions.list": [{ ...session, projectId: null, projectKey: null }],
				"agentRuns.activity": [],
				"settings.get": { menuLinks: [] },
				"system.gh": { ok: true, login: "storybook", error: null },
				"actors.setDefault": { name: "Storybook" },
			},
		},
	},
} satisfies Meta<typeof Navigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = {};
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
