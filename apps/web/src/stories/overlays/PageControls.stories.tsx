import type { Meta, StoryObj } from "@storybook/react-vite";
import { useQuery } from "@tanstack/react-query";
import { createRef, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PageHistory } from "../../features/pages/PageDetail/components/PageHistory";
import { PageShare } from "../../features/pages/PageDetail/components/PageShare";
import { PageWatcher } from "../../features/pages/PageDetail/components/PageWatcher";
import { PageListFilters } from "../../features/pages/PageList/components/PageListFilters";
import type { PageSearch } from "../../features/pages/PageList/pageSearch";
import { useApp } from "../../lib/appContext";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { at, failure, noop, page, pending, project, responses, run } from "./fixtures";
import { clickButton } from "./interactions";

const selectedWatcher = { pageId: page.id, agent: { id: run.id, name: run.name }, createdAt: at, updatedAt: at };
let watcher = page.watcher;

const meta = {
	title: "Overlays/PageControls",
	component: PageHistory,
	beforeEach: () => {
		watcher = null;
	},
	render: (args) => (
		<OverlayTrigger label="Page history">{(close) => <PageHistory {...args} onClose={close} />}</OverlayTrigger>
	),
	args: { page, onClose: noop, finalFocus: createRef<HTMLButtonElement>() },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"pages.versions": {
					items: [page.requestedVersion, { ...page.requestedVersion, number: 2, label: "Expanded catalog" }],
					nextCursor: null,
				},
				"pages.watcherOptions": { items: [run], nextCursor: null },
				"pages.get": () => ({ ...page, watcher }),
				"pages.watch": (input: unknown) => {
					watcher = (input as { agentId: string | null }).agentId === null ? null : selectedWatcher;
					return { ...page, watcher };
				},
			},
		},
	},
} satisfies Meta<typeof PageHistory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const HistoryOpen: Story = {};
export const HistoryEmpty: Story = {
	parameters: { trellis: { responses: { "pages.versions": { items: [], nextCursor: null } } } },
};
export const HistoryLoading: Story = { parameters: { trellis: { responses: { "pages.versions": pending } } } };
export const HistoryError: Story = { parameters: { trellis: { responses: { "pages.versions": failure } } } };
export const Share: Story = {
	render: () => (
		<OverlayTrigger label="Share Page">
			{(close) => <PageShare page={page} onClose={close} finalFocus={createRef()} />}
		</OverlayTrigger>
	),
};
export const WatcherClosed: Story = {
	render: function Render() {
		const { orpc } = useApp();
		const current = useQuery({
			...orpc.pages.get.queryOptions({ input: { page: page.id } }),
			initialData: { ...page, watcher },
		});
		return <PageWatcher page={current.data} disabled={false} />;
	},
};
export const WatcherOpen: Story = {
	...WatcherClosed,
	play: async ({ canvasElement }) => {
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("combobox", { name: "Page watcher" }),
		);
	},
};
export const WatcherSelected: Story = {
	...WatcherClosed,
	beforeEach: () => {
		watcher = selectedWatcher;
	},
};
export const WatcherDisabled: Story = { render: () => <PageWatcher page={page} disabled /> };
export const WatcherEmpty: Story = {
	...WatcherOpen,
	parameters: { trellis: { responses: { "pages.watcherOptions": { items: [], nextCursor: null } } } },
};
export const WatcherLoading: Story = {
	...WatcherClosed,
	parameters: { trellis: { responses: { "pages.watcherOptions": pending } } },
};
export const WatcherError: Story = {
	...WatcherClosed,
	parameters: { trellis: { responses: { "pages.watcherOptions": failure } } },
};
export const FiltersClosed: Story = {
	render: function Render() {
		const [search, setSearch] = useState<PageSearch>({});
		return <PageListFilters projectId={project.id} search={search} onChange={setSearch} />;
	},
};
export const FiltersOpen: Story = { ...FiltersClosed, play: clickButton("Filter Pages") };
export const FiltersSelected: Story = {
	render: function Render() {
		const [search, setSearch] = useState<PageSearch>({ comment: "open", pin: true, q: "catalog" });
		return <PageListFilters projectId={project.id} search={search} onChange={setSearch} />;
	},
};
export const AuthorFilter: Story = {
	...FiltersClosed,
	play: async (context) => {
		await clickButton("Filter Pages")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("option", { name: "Author" }),
		);
	},
};
export const WatcherFilter: Story = {
	...FiltersClosed,
	play: async (context) => {
		await clickButton("Filter Pages")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("option", { name: "Watcher" }),
		);
	},
};
export const CommentsFilter: Story = {
	...FiltersClosed,
	play: async (context) => {
		await clickButton("Filter Pages")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("option", { name: "Comments" }),
		);
	},
};
export const PinFilter: Story = {
	...FiltersClosed,
	play: async (context) => {
		await clickButton("Filter Pages")(context);
		await userEvent.click(await within(context.canvasElement.ownerDocument.body).findByRole("option", { name: "Pin" }));
	},
};

export const ChangeWatcher: Story = {
	...WatcherClosed,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		const control = await body.findByRole("combobox", { name: "Page watcher" });
		await waitFor(() => expect(control).toBeEnabled());
		await userEvent.click(control);
		await userEvent.click(await body.findByRole("option", { name: run.name }));
		await waitFor(() => expect(control).toHaveTextContent(run.name));
		await waitFor(() => expect(control).toBeEnabled());
		await userEvent.click(control);
		await userEvent.click(await body.findByRole("option", { name: "No watcher" }));
		await waitFor(() => expect(control).toHaveTextContent("No watcher"));
	},
};
export const ChangeFilter: Story = {
	...FiltersClosed,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Filter Pages")(context);
		await userEvent.click(await body.findByRole("option", { name: "Pin" }));
		await userEvent.click(await body.findByRole("option", { name: "Pinned" }));
		await expect(await body.findByRole("button", { name: "Remove Pin filter" })).toBeVisible();
		await clickButton("Remove Pin filter")(context);
		await expect(body.queryByRole("button", { name: "Remove Pin filter" })).not.toBeInTheDocument();
	},
};
