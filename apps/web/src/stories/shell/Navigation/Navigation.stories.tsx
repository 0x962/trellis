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
import { failure, pending, project, timestamp } from "../../pages/fixtures/project";
import { projectResponses } from "../../pages/fixtures/responses";
import { navigationFixtures } from "./navigationFixtures";

const { atlas, reviewProjects, reviewSessions, activities, pressureMachine } = navigationFixtures;

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
				"agentRuns.activity": activities,
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
