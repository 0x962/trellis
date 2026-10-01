import type { Meta, StoryObj } from "@storybook/react-vite";
import { StackedBarList } from "@trellis/ui";

const meta = {
	title: "Components/StackedBarList",
	component: StackedBarList,
	args: {
		label: "Waves",
		rows: [
			{
				key: "wave-1",
				name: "Wave 1",
				barLabel: "Wave 1 tickets",
				segments: [
					{ key: "done", label: "Done", value: 8, valueLabel: "8 tickets", tone: "success" },
					{ key: "started", label: "Started", value: 3, valueLabel: "3 tickets", tone: "warning" },
					{ key: "todo", label: "Todo", value: 2, valueLabel: "2 tickets", tone: "faint" },
				],
				valueLabel: "8/13",
			},
			{ key: "wave-2", name: "Wave 2", barLabel: "Wave 2 tickets", segments: [], valueLabel: "0/0" },
		],
	},
} satisfies Meta<typeof StackedBarList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { rows: [] } };
