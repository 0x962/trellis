import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentType } from "react";
import { userEvent, within } from "storybook/test";
import { ProjectLoadError } from "../../routes/p/$/components/ProjectLoadError";
import { ProjectLoading } from "../../routes/p/$/components/ProjectLoading";
import { Route } from "../../routes/p/$/route";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { projectResponses, ticketBoard, ticketCounts, ticketPage } from "./fixtures/responses";

const ProjectPage = Route.options.component as ComponentType;

const meta = {
	title: "Pages/Project",
	component: ProjectPage,
	parameters: {
		layout: "fullscreen",
		trellis: { route: Route, routePath: "/p/$", path: "/p/DEMO", loadRoute: false, responses: projectResponses },
	},
} satisfies Meta<typeof ProjectPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Board: Story = {};
export const Table: Story = { parameters: { trellis: { path: "/p/DEMO/table" } } };
export const NarrowBoard: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const NarrowTable: Story = {
	parameters: { trellis: { path: "/p/DEMO/table" } },
	globals: { viewport: { value: "phone", isRotated: false } },
};
export const EmptyBoard: Story = {
	parameters: { trellis: { responses: { "tickets.board": ticketBoard([]), "tickets.counts": ticketCounts([]) } } },
};
export const EmptyTable: Story = {
	parameters: {
		trellis: {
			path: "/p/DEMO/table",
			responses: { "tickets.list": ticketPage([]), "tickets.counts": ticketCounts([]) },
		},
	},
};
export const FilteredTable: Story = {
	parameters: { trellis: { path: "/p/DEMO/table?q=review&priority=medium&group=none" } },
};
export const NoFilterResults: Story = {
	parameters: {
		trellis: {
			path: "/p/DEMO/table?q=unmatched",
			responses: { "tickets.list": ticketPage([]), "tickets.counts": ticketCounts([]) },
		},
	},
};
export const BoardLoading: Story = { parameters: { trellis: { responses: { "tickets.board": pending } } } };
export const TableLoading: Story = {
	parameters: { trellis: { path: "/p/DEMO/table", responses: { "tickets.list": pending } } },
};
export const BoardError: Story = { parameters: { trellis: { responses: { "tickets.board": failure } } } };
export const TableError: Story = {
	parameters: { trellis: { path: "/p/DEMO/table", responses: { "tickets.list": failure } } },
};
export const RouteLoading: Story = { render: () => <ProjectLoading /> };
export const RouteError: Story = {
	render: () => <ProjectLoadError error={new Error("The project fixture is unavailable.")} />,
};
export const Archived: Story = {
	parameters: {
		trellis: {
			responses: {
				"projects.get": archivedProject,
				"projects.list": (input: { archived?: boolean }) => (input.archived ? [archivedProject] : []),
			},
		},
	},
};
export const LongProjectName: Story = {
	parameters: {
		trellis: {
			responses: {
				"projects.get": {
					...project,
					name: "The complete product interface review for the desktop application and the phone browser",
				},
			},
		},
	},
};
export const BoardSelection: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.keyboard("{Control>}");
		await userEvent.click(await within(canvasElement).findByRole("listitem", { name: /^DEMO-40 / }));
		await userEvent.keyboard("{/Control}");
	},
};
export const TableSelection: Story = {
	...Table,
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("checkbox", { name: "Select DEMO-40" }));
	},
};
