import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef } from "react";
import { userEvent, within } from "storybook/test";
import { PageHistory } from "../../features/pages/PageDetail/components/PageHistory";
import { PageShare } from "../../features/pages/PageDetail/components/PageShare";
import { PageWatcher } from "../../features/pages/PageDetail/components/PageWatcher";
import { PageListFilters } from "../../features/pages/PageList/components/PageListFilters";
import { at, failure, noop, page, pending, project, responses, run } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/PageControls",
	component: PageHistory,
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
				"pages.watch": page,
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
export const Share: Story = { render: () => <PageShare page={page} onClose={noop} finalFocus={createRef()} /> };
export const WatcherClosed: Story = { render: () => <PageWatcher page={page} disabled={false} /> };
export const WatcherOpen: Story = {
	...WatcherClosed,
	play: async ({ canvasElement }) => {
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("combobox", { name: "Page watcher" }),
		);
	},
};
export const WatcherSelected: Story = {
	render: () => (
		<PageWatcher
			page={{
				...page,
				watcher: { pageId: page.id, agent: { id: run.id, name: run.name }, createdAt: at, updatedAt: at },
			}}
			disabled={false}
		/>
	),
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
	render: () => <PageListFilters projectId={project.id} search={{}} onChange={noop} />,
};
export const FiltersOpen: Story = { ...FiltersClosed, play: clickButton("Filter Pages") };
export const FiltersSelected: Story = {
	render: () => (
		<PageListFilters projectId={project.id} search={{ comment: "open", pin: true, q: "catalog" }} onChange={noop} />
	),
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
