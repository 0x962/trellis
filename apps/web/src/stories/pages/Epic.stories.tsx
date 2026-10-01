import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EpicPage } from "../../features/epics/EpicPage";
import { documentHeadingNames, documentMarkdown, documentWithContents } from "./fixtures/document";
import { emptyCounts, epic, waves } from "./fixtures/epic";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { documentResource, resources, resourceThread } from "./fixtures/resources";
import { projectResponses, ticketCounts, ticketPage } from "./fixtures/responses";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Epic",
	component: EpicPage,
	args: { project, slug: epic.slug, search: {}, onSearchChange: () => {} },
	render: function Render(args) {
		const [, updateArgs] = useArgs();
		return <EpicPage {...args} onSearchChange={(search) => updateArgs({ search })} />;
	},
	parameters: {
		layout: "fullscreen",
		trellis: { path: "/p/DEMO/epics/interface-review", responses: projectResponses },
	},
} satisfies Meta<typeof EpicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WavesAndTickets: Story = {};
export const SwitchTabs: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("tab", { name: /Resources/ }));
		await expect(await canvas.findByRole("tabpanel", { name: /Resources/ })).toBeVisible();
		await userEvent.click(canvas.getByRole("tab", { name: "Overview" }));
		await expect(await canvas.findByRole("link", { name: "Open DEMO-40" })).toBeVisible();
	},
};
export const Empty: Story = {
	parameters: {
		trellis: {
			responses: {
				"epics.get": {
					...epic,
					counts: emptyCounts,
					waves: [],
					tickets: [],
					waveCount: 0,
					currentWave: null,
					currentWaveIndex: null,
				},
				"tickets.list": ticketPage([]),
				"tickets.counts": ticketCounts([]),
			},
		},
	},
};
export const EmptyWaves: Story = {
	parameters: {
		trellis: {
			responses: {
				"epics.get": {
					...epic,
					counts: emptyCounts,
					tickets: [],
					waves: waves.map((wave) => ({ ...wave, counts: emptyCounts, toStart: 0, waitsForYou: 0 })),
				},
				"tickets.list": ticketPage([]),
				"tickets.counts": ticketCounts([]),
			},
		},
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "epics.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "epics.get": failure } } } };
export const Archived: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const Resources: Story = { args: { search: { tab: "resources" } } };
export const ResourceDocument: Story = {
	args: { search: { tab: "resources" } },
	globals: { viewport: { value: "desktop", isRotated: false } },
	parameters: {
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: {
				"resources.list": resources,
				"resources.get": documentResource,
				"resourceComments.list": [resourceThread],
				"resourceComments.anchors": [],
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "Required states", level: 2 })).toBeVisible();
		const contents = within(await canvas.findByRole("navigation", { name: "Document contents" }));
		await expect(await contents.findByRole("button", { name: "Required states" })).toBeVisible();
		await expect(contents.queryByRole("button", { name: documentResource.name })).not.toBeInTheDocument();
	},
};

const contentsResponses = {
	"resources.list": resources.map((resource) =>
		resource.id === documentResource.id ? documentWithContents : resource,
	),
	"resources.get": documentWithContents,
	"resourceComments.list": [resourceThread],
	"resourceComments.anchors": [],
};

const checkDocumentContents = async (canvasElement: HTMLElement, compact: boolean) => {
	const canvas = within(canvasElement);
	const body = within(canvasElement.ownerDocument.body);
	const heading = await canvas.findByRole("heading", { name: "Saved proof", level: 6 });
	if (compact) await userEvent.click(await canvas.findByRole("button", { name: "Contents" }));
	const contents = within(await body.findByRole("navigation", { name: "Document contents" }));
	await waitFor(() => expect(contents.getByRole("button", { name: "Saved proof" })).toBeVisible());
	await expect(contents.getAllByRole("button").map((button) => button.textContent)).toEqual(documentHeadingNames);
	const scroll = heading.closest("article")!.parentElement!;
	await userEvent.click(contents.getByRole("button", { name: "Saved proof" }));
	await waitFor(() => expect(scroll.scrollTop).toBeGreaterThan(0));
	await expect(heading.getBoundingClientRect().top).toBeGreaterThanOrEqual(scroll.getBoundingClientRect().top);
	await expect(heading.getBoundingClientRect().bottom).toBeLessThanOrEqual(scroll.getBoundingClientRect().bottom);
	if (compact) {
		await waitFor(() => expect(body.queryByRole("dialog", { name: "Document contents" })).not.toBeInTheDocument());
		await userEvent.click(canvas.getByRole("button", { name: "Contents" }));
	}
	await waitFor(() => expect(body.getByRole("button", { name: "Saved proof", current: "location" })).toBeVisible());
};

export const ResourceDocumentContents: Story = {
	args: ResourceDocument.args,
	globals: { viewport: { value: "desktop", isRotated: false } },
	parameters: {
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: contentsResponses,
		},
	},
	play: async ({ canvasElement }) => {
		await checkDocumentContents(canvasElement, false);
		const contents = within(await within(canvasElement).findByRole("navigation", { name: "Document contents" }));
		await expect(contents.queryByRole("button", { name: documentResource.name })).not.toBeInTheDocument();
	},
};
export const ResourceDocumentNarrow: Story = {
	...ResourceDocumentContents,
	globals: { viewport: { value: "phone", isRotated: false } },
	play: async ({ canvasElement }) => checkDocumentContents(canvasElement, true),
};
export const ResourceDocumentReadOnly: Story = {
	...ResourceDocumentContents,
	args: { ...ResourceDocument.args, project: archivedProject },
	play: async ({ canvasElement }) => {
		await checkDocumentContents(canvasElement, false);
		await expect(within(canvasElement).queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
	},
};
export const PlanContents: Story = {
	args: { search: { tab: "resources" } },
	globals: { viewport: { value: "desktop", isRotated: false } },
	parameters: {
		trellis: {
			responses: { "epics.get": { ...epic, description: documentMarkdown }, "epics.update": pending },
		},
	},
	play: async ({ canvasElement }) => {
		await checkDocumentContents(canvasElement, false);
		const canvas = within(canvasElement);
		const editor = within(await canvas.findByRole("textbox", { name: "Description" }));
		const heading = editor.getByRole("heading", { name: "Saved proof", level: 6 });
		await userEvent.click(heading);
		const range = canvasElement.ownerDocument.createRange();
		range.selectNodeContents(heading);
		range.collapse(false);
		const selection = canvasElement.ownerDocument.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		await userEvent.keyboard(" draft");
		const contents = within(canvas.getByRole("navigation", { name: "Document contents" }));
		await expect(await contents.findByRole("button", { name: "Saved proof draft" })).toBeVisible();
		await expect(contents.queryByRole("button", { name: "Saved proof" })).not.toBeInTheDocument();
		await userEvent.keyboard("{Enter}## Follow-up checks{Enter}");
		await expect(await contents.findByRole("button", { name: "Follow-up checks" })).toBeVisible();
	},
};
export const ResourcesLoading: Story = {
	args: { search: { tab: "resources" } },
	parameters: { trellis: { responses: { "resources.list": pending } } },
};
export const ResourcesError: Story = {
	args: { search: { tab: "resources" } },
	parameters: { trellis: { responses: { "resources.list": failure } } },
};
