import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { pendingDocumentV1Example } from "@trellis/api";
import { expect, within } from "storybook/test";
import { FlowEditorRoute } from "../../features/flows/LangflowEditor/components/FlowEditorRoute";
import { flowDoc, flowResponses } from "./fixtures/flow";
import { failure, pending } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Flow editor",
	component: FlowEditorRoute,
	args: { slug: flowDoc.flow.slug },
	parameters: { layout: "fullscreen", trellis: { path: "/ai/flows/interface-review", responses: flowResponses } },
} satisfies Meta<typeof FlowEditorRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyCanvas: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const node of flowDoc.nodes) {
			await expect(await canvas.findByText(node.title, { exact: true })).toBeVisible();
		}
		await expect(canvasElement.querySelector(".react-flow")!.getBoundingClientRect().height).toBeGreaterThan(0);
	},
};
export const EmptyCanvas: Story = {
	parameters: { trellis: { responses: { "flows.get": { ...flowDoc, nodes: [], edges: [] } } } },
};
export const Loading: Story = { parameters: { trellis: { responses: { "flowDocumentsV1.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flowDocumentsV1.get": failure } } } };
export const LegacyLoading: Story = {
	parameters: { trellis: { responses: { "flows.get": pending } } },
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("status", { name: "Load the flow" })).toBeVisible();
	},
};
export const LegacyRequestError: Story = {
	parameters: { trellis: { responses: { "flows.get": failure } } },
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("heading", { name: "Could not load the flow" })).toBeVisible();
	},
};
export const LegacyMissing: Story = {
	parameters: {
		trellis: {
			responses: {
				"flows.get": () => {
					throw new ORPCError("NOT_FOUND");
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("heading", { name: "No flow with this name" })).toBeVisible();
	},
};
export const EditorHostUnavailable: Story = {
	args: { slug: pendingDocumentV1Example.flow.slug },
	parameters: { trellis: { responses: { "flowDocumentsV1.get": pendingDocumentV1Example } } },
};
export const EditorHostLoading: Story = {
	args: { slug: pendingDocumentV1Example.flow.slug },
	parameters: {
		trellis: { responses: { "flowDocumentsV1.get": pendingDocumentV1Example, "flowDocumentsV1.editorHost": pending } },
	},
};
export const EditorHostError: Story = {
	args: { slug: pendingDocumentV1Example.flow.slug },
	parameters: {
		trellis: { responses: { "flowDocumentsV1.get": pendingDocumentV1Example, "flowDocumentsV1.editorHost": failure } },
	},
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement).findByRole("heading", { name: "The editor host is unavailable" }),
		).toBeVisible();
	},
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
