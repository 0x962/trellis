import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { FlowsPage } from "../../features/flows/FlowsPage";
import { discoveryDocuments, flowResponses } from "./fixtures/flow";
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

export const MixedEnginesAndPublication: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		for (const document of discoveryDocuments) {
			await expect(await canvas.findByRole("link", { name: document.flow.name })).toBeVisible();
		}
	},
};
export const FilteredEmpty: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(await canvas.findByRole("searchbox", { name: "Search flows" }), "unmatched");
		await expect(await canvas.findByRole("heading", { name: "No matching flows" })).toBeVisible();
	},
};
export const SearchAndClear: Story = {
	play: async (context) => {
		await FilteredEmpty.play!(context);
		const canvas = within(context.canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Clear filters" }));
		await expect(canvas.getByRole("searchbox", { name: "Search flows" })).toHaveValue("");
		await MixedEnginesAndPublication.play!(context);
	},
};
export const Empty: Story = { parameters: { trellis: { responses: { "flows.list": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "flows.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flows.list": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
