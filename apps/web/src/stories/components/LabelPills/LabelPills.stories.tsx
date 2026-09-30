import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelPills } from "@trellis/ui";

const meta = {
	title: "Components/LabelPills",
	component: LabelPills,
	args: {
		labels: [
			{ id: "bug", name: "Bug", color: "red", group: "Type" },
			{ id: "web", name: "Web", color: "blue", group: "Area" },
			{ id: "small", name: "Small", color: "green", group: "Size" },
			{ id: "customer", name: "Customer report", color: "orange", group: null },
		],
	},
} satisfies Meta<typeof LabelPills>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { labels: [] } };
export const One: Story = { args: { labels: [{ id: "bug", name: "Bug", color: "red", group: null }] } };
export const Wrap: Story = { args: { wrap: true } };
export const SingleVisible: Story = { args: { max: 1 } };
