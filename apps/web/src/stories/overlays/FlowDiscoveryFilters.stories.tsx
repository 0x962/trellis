import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { FlowDiscoveryFilters } from "../../features/flows/FlowsPage/components/FlowDiscoveryFilters";
import { useStoryState } from "../components/useStoryState";
import { noop, projects } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/FlowDiscoveryFilters",
	component: FlowDiscoveryFilters,
	render: function Render(args) {
		const [filters, setValue] = useStoryState(args.filters);
		return <FlowDiscoveryFilters {...args} filters={filters} onChange={setValue} />;
	},
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
export const ChangeFilters: Story = {
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await fillField(context.canvasElement, "Search flows", "catalog");
		await clickButton("Filter flows")(context);
		await userEvent.click(await body.findByRole("option", { name: "Demo project" }));
		await expect(await body.findByRole("button", { name: "Remove project filter" })).toBeVisible();
		await clickButton("Remove project filter")(context);
		await expect(body.queryByRole("button", { name: "Remove project filter" })).not.toBeInTheDocument();
		await expect(body.getByRole("searchbox", { name: "Search flows" })).toHaveValue("catalog");
	},
};
