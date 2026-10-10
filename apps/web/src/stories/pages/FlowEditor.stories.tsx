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
	nodes: [
		{ ...baseNode, instruction: "" },
		{
			...baseNode,
			id: id(699),
			kind: "group",
			title: "",
			instruction: "",
			x: 320,
			width: 320,
			height: 200,
		},
		...flowDoc.nodes.slice(1),
	],
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
let recoveryRequests = 0;

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
export const ZoomScaledTargets: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findByRole("button", { name: "Review the interface, connection, bottom" });
		const minimum = matchMedia("(pointer: coarse)").matches ? 44 : 28;
		const checkTargets = () => {
			const handles = [...canvasElement.querySelectorAll<HTMLElement>(".react-flow__handle")];
			for (const handle of handles) {
				const rect = handle.getBoundingClientRect();
				expect(rect.width).toBeGreaterThanOrEqual(minimum - 0.05);
				expect(rect.height).toBeGreaterThanOrEqual(minimum - 0.05);
				expect(rect.width).toBeLessThanOrEqual(minimum + 0.05);
				expect(handle).toHaveAttribute("role", "button");
				expect(handle).toHaveAttribute("tabindex", "0");
			}
		};
		await waitFor(checkTargets);
		await userEvent.click(canvas.getByRole("button", { name: "Zoom in" }));
		await waitFor(() => {
			const handle = canvasElement.querySelector<HTMLElement>(".react-flow__handle")!;
			const zoom = Number(getComputedStyle(handle).getPropertyValue("--flow-zoom"));
			expect(zoom).toBeGreaterThan(1);
		});
		await waitFor(checkTargets);
		const center = canvas.getByRole("button", { name: "Center the flow at 100% zoom" });
		await userEvent.hover(center);
		await expect(await within(canvasElement.ownerDocument.body).findByRole("tooltip")).toHaveTextContent(
			"Center the flow at 100% zoom",
		);
		await userEvent.click(center);
		await waitFor(() => expect(canvas.getByRole("button", { name: "Zoom out" })).toBeDisabled());
		await waitFor(() =>
			expect(
				getComputedStyle(canvasElement.querySelector(".react-flow__handle")!).getPropertyValue("--flow-zoom"),
			).toBe("1"),
		);
		await userEvent.unhover(center);
		await waitFor(checkTargets);
	},
};
export const BranchCues: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const handle = await canvas.findByRole("button", { name: "Does the review pass?, No, right" });
		for (const branch of canvasElement.querySelectorAll<HTMLElement>(".react-flow__handle[data-branch]")) {
			expect(getComputedStyle(branch, "::after").content).toBe(`"${branch.dataset.branch}"`);
			expect(getComputedStyle(branch).opacity).toBe("1");
		}
		await userEvent.hover(handle);
		await expect(await within(canvasElement.ownerDocument.body).findByRole("tooltip")).toHaveTextContent(
			"Does the review pass?, No, right",
		);
		await userEvent.unhover(handle);
	},
};
export const KeyboardConnections: Story = {
	parameters: { trellis: { responses: { "flows.get": { ...flowDoc, edges: [] } } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const source = await canvas.findByRole("button", { name: "Review the interface, connection, bottom" });
		const target = await canvas.findByRole("button", { name: "Does the review pass?, input, top" });
		source.focus();
		await userEvent.keyboard("{Enter}");
		await expect(source).toHaveAttribute("aria-pressed", "true");
		target.focus();
		await userEvent.keyboard(" ");
		await waitFor(() => expect(canvasElement.querySelectorAll(".react-flow__edge")).toHaveLength(1));
		const branch = canvas.getByRole("button", { name: "Does the review pass?, No, bottom" });
		branch.focus();
		await userEvent.keyboard("{Enter}");
		canvas.getByRole("button", { name: "Approve the result, connection, top" }).focus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(canvasElement.querySelectorAll(".react-flow__edge")).toHaveLength(2));
		await expect(
			canvasElement.querySelector('[aria-label="Connection from Does the review pass? to Approve the result, No"]'),
		).toBeInTheDocument();
		source.focus();
		await userEvent.keyboard("{Enter}{Escape}");
		await expect(source).toHaveAttribute("aria-pressed", "false");
		await expect(getComputedStyle(source).outlineWidth).toBe("2px");
		const edge = canvasElement.querySelector<SVGGElement>(
			'.react-flow__edge[aria-label="Connection from Does the review pass? to Approve the result, No"]',
		)!;
		edge.focus();
		await expect(getComputedStyle(edge.querySelector(".react-flow__edge-path")!).strokeWidth).toBe("3px");
		const node = canvasElement.querySelector<HTMLElement>(".react-flow__node")!;
		node.focus();
		await expect(getComputedStyle(node.firstElementChild!).outlineWidth).toBe("2px");
		await userEvent.keyboard("{Enter}");
		await expect(
			await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Edit agent" }),
		).toBeVisible();
	},
};
export const RequestRecovery: Story = {
	beforeEach: () => {
		recoveryRequests = 0;
	},
	parameters: {
		trellis: {
			responses: {
				"flows.get": () => {
					recoveryRequests += 1;
					if (recoveryRequests === 1) throw new Error("The synthetic flow request fails once.");
					return flowDoc;
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Retry" }));
		await waitFor(() => expect(canvas.getByText("Review the interface", { exact: true })).toBeVisible());
		await expect(recoveryRequests).toBe(2);
	},
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
		await expect(await within(canvasElement).findByRole("link", { name: "Back to flows" })).toHaveAttribute(
			"href",
			"/ai/flows",
		);
	},
};
export const InvalidNodes: Story = {
	parameters: { trellis: { responses: { "flows.get": invalidFlowDoc } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const message of ["Write an instruction.", "Write a title."]) {
			const issue = await canvas.findByText(message, { exact: true });
			await waitFor(() => expect(issue).toBeVisible());
			const alert = issue.closest("[role=alert]")!;
			await expect(alert).toBeVisible();
			await expect(issue.closest("[aria-invalid=true]")).toHaveAttribute("aria-describedby", alert.parentElement!.id);
		}
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
