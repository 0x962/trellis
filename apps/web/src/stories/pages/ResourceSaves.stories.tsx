import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Resource } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EpicPage } from "../../features/epics/EpicPage";
import { epic } from "./fixtures/epic";
import { project } from "./fixtures/project";
import { documentResource } from "./fixtures/resources";
import { projectResponses } from "./fixtures/responses";
import { pageFrame } from "./pageFrame";

const secondDocument = {
	...documentResource,
	id: "01M3ST0RYB00K0000000000814",
	name: "Second document",
	body: "Second document body.",
};
type SaveInput = { id: string; name?: string; body?: string };
let stored: Resource[] = [];
const pendingSaves: { input: SaveInput; snapshot: Resource; resolve: (resource: Resource) => void }[] = [];
const resourceReads: string[] = [];

const meta = {
	title: "Pages/Resource saves",
	component: EpicPage,
	decorators: [pageFrame],
	args: { project, slug: epic.slug, search: { tab: "resources" }, onSearchChange: () => {} },
	parameters: {
		layout: "fullscreen",
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: {
				...projectResponses,
				"resources.list": () => stored,
				"resourceComments.list": [],
				"resourceComments.anchors": [],
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
	beforeEach: () => {
		stored = [{ ...documentResource }, { ...secondDocument }];
		pendingSaves.length = 0;
		resourceReads.length = 0;
	},
} satisfies Meta<typeof EpicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReorderedConcurrentSaves: Story = {
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
		await expect(bodySave.snapshot.name).toBe(documentResource.name);
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
