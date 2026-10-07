import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Resource } from "@trellis/api";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EpicPage } from "../../features/epics/EpicPage";
import { epic } from "./fixtures/epic";
import { project } from "./fixtures/project";
import { documentResource } from "./fixtures/resources";
import { projectResponses } from "./fixtures/responses";
import { pageFrame } from "./pageFrame";

const longTitle = "Synthetic document title with complete acceptance checks for a narrow screen and browser zoom";
const secondDocument = {
	...documentResource,
	id: "01M3ST0RYB00K0000000000814",
	name: "Second document",
	body: "Second document body.",
};
let stored: Resource[] = [];
let refuseSave = true;
let attempts: { id: string; name?: string; body?: string }[] = [];

const responses = {
	...projectResponses,
	"resources.list": () => stored,
	"resources.get": ({ id }: { id: string }) => stored.find((resource) => resource.id === id)!,
	"resourceComments.list": [],
	"resourceComments.anchors": [],
	"resources.update": async (input: { id: string; name?: string; body?: string }) => {
		attempts.push(input);
		await new Promise((resolve) => setTimeout(resolve, 250));
		if (refuseSave) throw new Error("The synthetic save fails.");
		stored = stored.map((resource) => (resource.id === input.id ? { ...resource, ...input } : resource));
		return stored.find((resource) => resource.id === input.id)!;
	},
};

const meta = {
	title: "Pages/Document editor",
	component: EpicPage,
	decorators: [pageFrame],
	args: { project, slug: epic.slug, search: { tab: "resources" }, onSearchChange: () => {} },
	render: function Render(args) {
		const [, updateArgs] = useArgs();
		return <EpicPage {...args} onSearchChange={(search) => updateArgs({ search })} />;
	},
	parameters: {
		layout: "fullscreen",
		trellis: { path: `/p/DEMO/epics/interface-review#${documentResource.id}`, responses },
	},
	beforeEach: () => {
		stored = [{ ...documentResource, name: longTitle }, { ...secondDocument }];
		refuseSave = true;
		attempts = [];
	},
} satisfies Meta<typeof EpicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReadableTitle: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const title = await canvas.findByRole("textbox", { name: "Title" });
		const body = await canvas.findByRole("textbox", { name: "Description" });
		await expect(title).toHaveAttribute("data-variant", "document");
		await expect(getComputedStyle(title).maxHeight).toBe("none");
		await expect(title.scrollHeight).toBeLessThanOrEqual(title.clientHeight);
		await waitFor(() => expect(body).toHaveFocus());
		await userEvent.click(title);
		await waitFor(() => expect(title).toHaveFocus());
		await expect(getComputedStyle(title).outlineStyle).toBe("solid");
		await expect(getComputedStyle(title).outlineWidth).toBe("2px");
	},
};
export const RetryAndReopen: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const title = await canvas.findByRole("textbox", { name: "Title" });
		const body = await canvas.findByRole("textbox", { name: "Description" });
		const draftTitle = `${longTitle} draft`;
		await userEvent.clear(title);
		await userEvent.type(title, draftTitle);
		await userEvent.click(body);
		await userEvent.keyboard("{Control>}End{/Control}{Enter}Synthetic saved body.");
		await waitFor(() => expect(attempts).toHaveLength(2));
		await expect(await canvas.findByText("The document save failed.")).toBeVisible();
		await waitFor(() => expect(canvas.queryByText("Save in progress")).not.toBeInTheDocument());
		await expect(title).toHaveValue(draftTitle);
		await expect(body).toHaveTextContent("Synthetic saved body.");
		refuseSave = false;
		await userEvent.click(canvas.getByRole("button", { name: "Retry save" }));
		await expect(await canvas.findByText("Saved")).toBeVisible();
		await expect(attempts).toHaveLength(4);
		await expect(attempts[2]).toEqual(attempts[0]);
		await expect(attempts[3]).toEqual(attempts[1]);
		await userEvent.click(canvas.getByRole("button", { name: secondDocument.name }));
		await waitFor(() => expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(secondDocument.name));
		await userEvent.click(canvas.getByRole("button", { name: draftTitle }));
		await waitFor(() => expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(draftTitle));
		await expect(await canvas.findByRole("textbox", { name: "Description" })).toHaveTextContent(
			"Synthetic saved body.",
		);
	},
};

export const SaveOnSwitch: Story = {
	beforeEach: () => {
		refuseSave = false;
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const title = await canvas.findByRole("textbox", { name: "Title" });
		await canvas.findByRole("textbox", { name: "Description" });
		await userEvent.clear(title);
		await userEvent.type(title, "Switch draft");
		await userEvent.click(canvas.getByRole("button", { name: secondDocument.name }));
		await waitFor(() => expect(stored[0]!.name).toBe("Switch draft"));
		await userEvent.click(await canvas.findByRole("button", { name: "Switch draft" }));
		await waitFor(() => expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue("Switch draft"));
	},
};

type SaveInput = { id: string; name?: string; body?: string };
const pendingSaves: { input: SaveInput; snapshot: Resource; resolve: (resource: Resource) => void }[] = [];
const resourceReads: string[] = [];

export const ReorderedConcurrentSaves: Story = {
	beforeEach: () => {
		pendingSaves.length = 0;
		resourceReads.length = 0;
	},
	parameters: {
		trellis: {
			responses: {
				"resources.get": ({ id }: { id: string }) => {
					resourceReads.push(id);
					return stored.find((resource) => resource.id === id)!;
				},
				"resources.update": (input: SaveInput) => {
					stored = stored.map((resource) => (resource.id === input.id ? { ...resource, ...input } : resource));
					const snapshot = stored.find((resource) => resource.id === input.id)!;
					return new Promise<Resource>((resolve) => pendingSaves.push({ input, snapshot, resolve }));
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const body = await canvas.findByRole("textbox", { name: "Description" });
		await userEvent.click(body);
		await userEvent.keyboard("{Control>}End{/Control}{Enter}Concurrent body.");
		const title = canvas.getByRole("textbox", { name: "Title" });
		await userEvent.click(title);
		await waitFor(() => expect(pendingSaves).toHaveLength(1));
		await userEvent.clear(title);
		await userEvent.type(title, "Concurrent title");
		await userEvent.click(canvas.getByRole("button", { name: secondDocument.name }));
		await waitFor(() => expect(pendingSaves).toHaveLength(2));
		await waitFor(() => expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(secondDocument.name));
		const bodySave = pendingSaves.find((save) => save.input.body !== undefined)!;
		const titleSave = pendingSaves.find((save) => save.input.name !== undefined)!;
		await expect(bodySave.snapshot.name).toBe(longTitle);
		await expect(titleSave.snapshot.name).toBe("Concurrent title");
		await expect(titleSave.snapshot.body).toContain("Concurrent body.");
		titleSave.resolve(titleSave.snapshot);
		await waitFor(() => expect(resourceReads.filter((id) => id === secondDocument.id)).toHaveLength(2));
		bodySave.resolve(bodySave.snapshot);
		await waitFor(() => expect(resourceReads.filter((id) => id === secondDocument.id)).toHaveLength(3));
		await userEvent.click(await canvas.findByRole("button", { name: "Concurrent title" }));
		await waitFor(() => expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue("Concurrent title"));
		await expect(await canvas.findByRole("textbox", { name: "Description" })).toHaveTextContent("Concurrent body.");
	},
};
