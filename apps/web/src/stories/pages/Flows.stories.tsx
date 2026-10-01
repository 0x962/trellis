import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { FlowsPage } from "../../features/flows/FlowsPage";
import { flowResponses, flowSummaries } from "./fixtures/flow";
import { failure, pending } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

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
export const Loading: Story = { parameters: { trellis: { responses: { "flows.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flows.list": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
