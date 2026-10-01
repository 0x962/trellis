import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentType } from "react";
import { expect, userEvent, within } from "storybook/test";
import { RouteError } from "../../features/shell/RouteError";
import { ShellFrame } from "../../features/shell/ShellFrame";
import { Route } from "../../routes/search";
import { projectResponses } from "./fixtures/responses";
import { searchPage, searchPageError, searchResults } from "./fixtures/search";
import { pageFrame } from "./pageFrame";

const SearchPage = Route.options.component as ComponentType;

const meta = {
	decorators: [pageFrame],
	title: "Pages/Search",
	component: SearchPage,
	parameters: {
		layout: "fullscreen",
		trellis: {
			route: Route,
			routePath: "/search",
			path: "/search?q=DEMO",
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
export const PriorityFilter: Story = {
	parameters: { trellis: { path: "/search?q=DEMO&priority=urgent" } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("link", { name: "DEMO-40" })).toBeVisible();
		await expect(canvas.queryByRole("link", { name: "DEMO-41" })).not.toBeInTheDocument();
	},
};
export const SearchAndClear: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = await canvas.findByRole("searchbox", { name: "Search" });
		await userEvent.clear(field);
		await expect(await canvas.findByRole("heading", { name: "Search tickets, Pages, and projects" })).toBeVisible();
		await userEvent.type(field, "unmatched");
		await expect(await canvas.findByRole("heading", { name: "No results for 'unmatched'" })).toBeVisible();
		await userEvent.clear(field);
		await userEvent.type(field, "review");
		await expect(await canvas.findByRole("link", { name: "DEMO-42" })).toBeVisible();
		await expect(canvas.queryByRole("link", { name: "DEMO-40" })).not.toBeInTheDocument();
	},
};
export const LoadMore: Story = {
	parameters: { trellis: { responses: { "search.query": searchPage } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("link", { name: "DEMO-40" })).toBeVisible();
		await userEvent.click(await canvas.findByRole("button", { name: "Load more results" }));
		await expect(await canvas.findByRole("link", { name: "DEMO-44" })).toBeVisible();
		await expect(canvas.getByRole("link", { name: "DEMO-40" })).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Load more results" })).not.toBeInTheDocument();
	},
};
export const LoadMoreError: Story = {
	parameters: { trellis: { responses: { "search.query": searchPageError } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Load more results" }));
		await expect(await canvas.findByRole("heading", { name: "More results did not load" })).toBeVisible();
		await expect(canvas.getByRole("link", { name: "DEMO-40" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Retry" })).toBeVisible();
	},
};
export const Loading: Story = { render: () => <ShellFrame /> };
export const RequestError: Story = {
	render: () => <RouteError error={new globalThis.Error("The search fixture is unavailable.")} />,
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
