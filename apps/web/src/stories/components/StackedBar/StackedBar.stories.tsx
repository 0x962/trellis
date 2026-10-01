import type { Meta, StoryObj } from "@storybook/react-vite";
import { StackedBar } from "@trellis/ui";

const meta = {
	title: "Components/StackedBar",
	component: StackedBar,
	args: {
		label: "Tickets by status",
		segments: [
			{ key: "done", label: "Done", value: 8, valueLabel: "8 tickets", tone: "success" },
			{ key: "started", label: "Started", value: 3, valueLabel: "3 tickets", tone: "warning" },
			{ key: "todo", label: "Todo", value: 2, valueLabel: "2 tickets", tone: "faint" },
		],
	},
} satisfies Meta<typeof StackedBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { segments: [] } };
export const Zero: Story = {
	args: { segments: [{ key: "todo", label: "Todo", value: 0, valueLabel: "0 tickets", tone: "faint" }] },
};
export const Small: Story = { args: { size: "sm" } };
export const WithoutLegend: Story = { args: { legend: false } };
