import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { EpicPage } from "../../features/epics/EpicPage";
import type { PreparedStory } from "../support/prepareStory";
import { documentWithContents } from "./fixtures/document";
import { epic } from "./fixtures/epic";
import { failure, project } from "./fixtures/project";
import { documentResource, resources, resourceThread } from "./fixtures/resources";
import { projectResponses } from "./fixtures/responses";
import { pageFrame } from "./pageFrame";

const meta = {
	title: "Pages/Resource recovery",
	component: EpicPage,
	decorators: [pageFrame],
	args: { project, slug: epic.slug, search: { tab: "resources" }, onSearchChange: () => {} },
	parameters: {
		layout: "fullscreen",
		trellis: { path: "/p/DEMO/epics/interface-review", responses: projectResponses },
	},
} satisfies Meta<typeof EpicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

const contentsResponses = {
	"resources.list": resources.map((resource) =>
		resource.id === documentResource.id ? documentWithContents : resource,
	),
	"resources.get": documentWithContents,
	"resourceComments.list": [resourceThread],
	"resourceComments.anchors": [],
};

const failOnce = (value: unknown) => {
	let requests = 0;
	return () => {
		if (requests++ === 0) return failure();
		return value;
	};
};

export const ResourcesRecovery: Story = {
	args: { search: { tab: "resources" } },
	parameters: { trellis: { responses: { "resources.list": failOnce(resources) } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("alert")).toHaveTextContent("The resources do not load.");
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
		await expect(await canvas.findByRole("button", { name: "Links" })).toBeVisible();
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
	},
};

export const ResourceOpenRecovery: Story = {
	args: { search: { tab: "resources" } },
	parameters: {
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: { ...contentsResponses, "resources.get": failOnce(documentWithContents) },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("alert")).toHaveTextContent("The resource does not load.");
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
		await expect(await canvas.findByRole("textbox", { name: "Title" })).toHaveValue(documentResource.name);
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
	},
};

export const ResourceCreateRecovery: Story = {
	args: { search: { tab: "resources" } },
	parameters: {
		trellis: {
			responses: {
				...contentsResponses,
				"resources.add": failOnce(documentWithContents),
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Documents" }));
		await userEvent.click(await canvas.findByRole("button", { name: "New document" }));
		await expect(await canvas.findByRole("alert")).toHaveTextContent("The document is not created.");
		await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
		await expect(await canvas.findByRole("textbox", { name: "Title" })).toHaveValue(documentResource.name);
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
	},
};

export const CachedResourceFailure: Story = {
	args: { search: { tab: "resources" } },
	parameters: {
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: {
				...contentsResponses,
				"resources.get": (() => {
					let requests = 0;
					return () => (requests++ === 0 ? documentWithContents : failure());
				})(),
			},
		},
	},
	play: async ({ canvasElement, loaded }) => {
		const canvas = within(canvasElement);
		const title = await canvas.findByRole("textbox", { name: "Title" });
		const editor = await canvas.findByRole("textbox", { name: "Description" });
		const { app } = loaded.appStory as PreparedStory;
		await app.queryClient.invalidateQueries({
			queryKey: app.orpc.resources.get.queryOptions({ input: { id: documentResource.id } }).queryKey,
		});
		await expect(canvas.getByRole("textbox", { name: "Title" })).toBe(title);
		await expect(canvas.getByRole("textbox", { name: "Description" })).toBe(editor);
		await expect(title).toHaveValue(documentResource.name);
		await userEvent.click(canvas.getByRole("button", { name: "Images" }));
		await expect(canvas.getByRole("button", { name: "Review image.jpg" })).toBeVisible();
		await expect(canvas.getByRole("button", { name: "Retry" })).toBeVisible();
		await expect(canvas.getByRole("alert")).toHaveTextContent("The resource does not load.");
	},
};
