import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowDiscoveryFilters } from "../../features/flows/FlowsPage/components/FlowDiscoveryFilters";
import { noop, projects } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/FlowDiscoveryFilters",
	component: FlowDiscoveryFilters,
	args: { filters: { query: "", project: null }, projects, onChange: noop },
} satisfies Meta<typeof FlowDiscoveryFilters>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Filter flows") };
export const Selected: Story = {
	args: { filters: { query: "catalog", project: "DEMO" } },
	play: clickButton("Filter flows"),
};
export const Empty: Story = { args: { projects: [] }, play: clickButton("Filter flows") };
export const SearchEmpty: Story = {
	play: async (context) => {
		await clickButton("Filter flows")(context);
		await fillField(context.canvasElement, "Search projects", "Unlisted project");
	},
};
