import type { Meta, StoryObj } from "@storybook/react-vite";
import { pendingDocumentV1Example } from "@trellis/api";
import { FlowEditorRoute } from "../../features/flows/LangflowEditor/components/FlowEditorRoute";
import { flowDoc, flowResponses } from "./fixtures/flow";
import { failure, pending } from "./fixtures/project";

const meta = {
	title: "Pages/Flow editor",
	component: FlowEditorRoute,
	args: { slug: flowDoc.flow.slug },
	parameters: { layout: "fullscreen", trellis: { path: "/ai/flows/interface-review", responses: flowResponses } },
} satisfies Meta<typeof FlowEditorRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LegacyCanvas: Story = {};
export const EmptyCanvas: Story = {
	parameters: { trellis: { responses: { "flows.get": { ...flowDoc, nodes: [], edges: [] } } } },
};
export const Loading: Story = { parameters: { trellis: { responses: { "flowDocumentsV1.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flowDocumentsV1.get": failure } } } };
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
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
