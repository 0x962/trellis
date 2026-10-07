import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { FlowsPage } from "../../features/flows/FlowsPage";
import { flowResponses } from "./fixtures/flow";
import { failure, id, pending } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const flowSummaries = flowResponses["flows.list"];
const longContent = flowSummaries.map((flow, index) =>
	index === 0
		? {
				...flow,
				name: "A review flow with a long name that still keeps the main choice readable",
				description:
					"Review the interface, keyboard controls, responsive layout, dense data, empty states, failures, saved choices, and the evidence for every required state.",
			}
		: flow,
);
const denseFlows = Array.from({ length: 12 }, (_, index) => ({
	...flowSummaries[index % flowSummaries.length]!,
	id: id(600 + index),
	slug: `review-flow-${index + 1}`,
	name: `Review flow ${index + 1}`,
}));

const meta = {
	decorators: [pageFrame],
	title: "Pages/Flows",
	component: FlowsPage,
	parameters: { layout: "fullscreen", trellis: { path: "/ai/flows", responses: flowResponses } },
} satisfies Meta<typeof FlowsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const document of flowSummaries) {
			await expect(await canvas.findByRole("link", { name: document.name })).toBeVisible();
		}
	},
};
export const Empty: Story = { parameters: { trellis: { responses: { "flows.list": [] } } } };
export const EmptyCreateAction: Story = {
	...Empty,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "New flow" }));
		await expect(
			await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "New flow" }),
		).toBeVisible();
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "flows.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flows.list": failure } } } };
export const LongContent: Story = { parameters: { trellis: { responses: { "flows.list": longContent } } } };
export const DenseCards: Story = { parameters: { trellis: { responses: { "flows.list": denseFlows } } } };
export const CardHover: Story = {
	play: async ({ canvasElement }) => {
		const link = await within(canvasElement).findByRole("link", { name: flowSummaries[0]!.name });
		await userEvent.hover(link);
		await expect(link).toBeVisible();
	},
};
export const CardFocus: Story = {
	play: async ({ canvasElement }) => {
		const link = await within(canvasElement).findByRole("link", { name: flowSummaries[0]!.name });
		link.focus();
		await expect(link).toHaveFocus();
	},
};
export const Narrow: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
