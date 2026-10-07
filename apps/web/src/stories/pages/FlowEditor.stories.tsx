import { ORPCError } from "@orpc/client";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { FlowDoc } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { FlowEditor } from "../../features/flows/FlowEditor";
import { flowDoc, flowResponses } from "./fixtures/flow";
import { failure, id, pending } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const baseNode = flowDoc.nodes[0]!;
const invalidFlowDoc: FlowDoc = {
	...flowDoc,
	nodes: [{ ...baseNode, instruction: "" }, ...flowDoc.nodes.slice(1)],
};
const denseLongFlowDoc: FlowDoc = {
	...flowDoc,
	nodes: Array.from({ length: 24 }, (_, index) => ({
		...baseNode,
		id: id(700 + index),
		title: `Review the complete interface journey with the evidence set ${index + 1}`,
		instruction: `Check the layout, keyboard controls, and retained state for evidence set ${index + 1}.`,
		x: (index % 6) * 280,
		y: Math.floor(index / 6) * 180,
	})),
	edges: [],
};
const connectionLossFlowDoc: FlowDoc = {
	...flowDoc,
	nodes: [
		{
			...baseNode,
			id: id(730),
			kind: "group",
			title: "Decision group",
			instruction: "",
			x: 520,
			y: 0,
			width: 420,
			height: 320,
		},
		{ ...baseNode, id: id(731), title: "Outside start", x: 0, y: 0 },
		{ ...baseNode, id: id(732), title: "Move into group", x: 0, y: 180 },
	],
	edges: [{ id: id(733), fromNodeId: id(731), toNodeId: id(732), branch: "out" }],
};

const meta = {
	decorators: [pageFrame],
	title: "Pages/Flow editor",
	component: FlowEditor,
	args: { slug: flowDoc.flow.slug },
	parameters: { layout: "fullscreen", trellis: { path: "/ai/flows/interface-review", responses: flowResponses } },
} satisfies Meta<typeof FlowEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Canvas: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const node of flowDoc.nodes) {
			const title = await canvas.findByText(node.title, { exact: true });
			await waitFor(() => expect(title).toBeVisible());
		}
		await expect(canvasElement.querySelector(".react-flow")!.getBoundingClientRect().height).toBeGreaterThan(0);
		await expect(canvasElement.querySelector(".react-flow__minimap")).toBeVisible();
	},
};
export const EmptyCanvas: Story = {
	parameters: { trellis: { responses: { "flows.get": { ...flowDoc, nodes: [], edges: [] } } } },
};
export const KeyboardDeleteRequiresConfirmation: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const node = await canvas.findByText(flowDoc.nodes[0]!.title, { exact: true });
		const nodeElement = node.closest<HTMLElement>(".react-flow__node")!;
		await waitFor(() => expect(nodeElement).toBeVisible());
		await userEvent.click(nodeElement);
		const deleteButton = await within(canvasElement.ownerDocument.body).findByRole("button", { name: "Delete step" });
		await expect(deleteButton).toBeVisible();
		const before = canvasElement.querySelectorAll(".react-flow__node").length;
		nodeElement.focus();
		await userEvent.keyboard("{Delete}{Backspace}");
		await expect(canvasElement.querySelectorAll(".react-flow__node")).toHaveLength(before);
		await expect(deleteButton).toBeVisible();
	},
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "flows.get": pending } } },
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("status", { name: "Load the flow" })).toBeVisible();
	},
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "flows.get": failure } } },
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("heading", { name: "Could not load the flow" })).toBeVisible();
	},
};
export const Missing: Story = {
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
export const InvalidNodes: Story = {
	parameters: { trellis: { responses: { "flows.get": invalidFlowDoc } } },
	play: async ({ canvasElement }) => {
		const issue = await within(canvasElement).findByText("Write an instruction.", { exact: true });
		await waitFor(() => expect(issue).toBeVisible());
		await expect(issue.closest("[role=alert]")).toBeVisible();
		await expect(issue.closest("[aria-invalid=true]")).toHaveAttribute("aria-describedby", issue.parentElement!.id);
	},
};
export const DenseLongGraph: Story = {
	parameters: { trellis: { responses: { "flows.get": denseLongFlowDoc } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const first = await canvas.findByText(denseLongFlowDoc.nodes[0]!.title);
		const last = await canvas.findByText(denseLongFlowDoc.nodes.at(-1)!.title);
		await waitFor(() => expect(first).toBeVisible());
		await waitFor(() => expect(last).toBeVisible());
	},
};
export const ConnectionLossUndo: Story = {
	parameters: { trellis: { responses: { "flows.get": connectionLossFlowDoc } } },
	play: async ({ canvasElement }) => {
		const node = await within(canvasElement).findByText("Move into group", { exact: true });
		await waitFor(() => expect(node).toBeVisible());
	},
};
export const Narrow: Story = {
	globals: { viewport: { value: "narrow", isRotated: false } },
	play: async ({ canvasElement }) => {
		await expect(canvasElement.querySelector(".react-flow__minimap")).toBeNull();
	},
};
