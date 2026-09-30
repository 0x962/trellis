import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentType } from "react";
import { RouteError } from "../../features/shell/RouteError";
import { ShellFrame } from "../../features/shell/ShellFrame";
import { Route } from "../../routes/search";
import { page } from "./fixtures/page";
import { project, tickets } from "./fixtures/project";
import { projectResponses } from "./fixtures/responses";

const SearchPage = Route.options.component as ComponentType;
const searchResults = { tickets, projects: [project], pages: [page], nextOffset: null };

const meta = {
	title: "Pages/Search",
	component: SearchPage,
	parameters: {
		layout: "fullscreen",
		trellis: {
			route: Route,
			routePath: "/search",
			path: "/search?q=review",
			loadRoute: false,
			responses: { ...projectResponses, "search.query": searchResults },
		},
	},
} satisfies Meta<typeof SearchPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {};
export const Initial: Story = { parameters: { trellis: { path: "/search" } } };
export const Empty: Story = {
	parameters: {
		trellis: { responses: { "search.query": { tickets: [], projects: [], pages: [], nextOffset: null } } },
	},
};
export const PriorityFilter: Story = { parameters: { trellis: { path: "/search?q=review&priority=urgent" } } };
export const Loading: Story = { render: () => <ShellFrame /> };
export const RequestError: Story = {
	render: () => <RouteError error={new globalThis.Error("The search fixture is unavailable.")} />,
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
