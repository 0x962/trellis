import type { Meta, StoryObj } from "@storybook/react-vite";
import { UsageChart } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/UsageChart",
	component: UsageChart,
	args: {
		label: "Daily usage",
		days: ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"],
		series: [
			{ key: "review", label: "Review agent", tone: "success", values: [12, 8, 20, 14] },
			{ key: "build", label: "Build agent", tone: "warning", values: [6, 4, 12, 8] },
		],
		format: (value) => `${value}k`,
		formatDay: (day) => day,
		selectedDay: null,
		onSelectDay: () => {},
	},
	parameters: {
		docs: {
			description: {
				component: "Click a day to select it. Arrow keys move between days. Enter changes the selection.",
			},
		},
	},
	render: function Render(args) {
		const [selectedDay, setSelectedDay] = useStoryState(args.selectedDay);
		return <UsageChart {...args} selectedDay={selectedDay} onSelectDay={setSelectedDay} />;
	},
} satisfies Meta<typeof UsageChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Line: Story = { args: { variant: "line" } };
export const Selected: Story = { args: { selectedDay: "2026-09-29" } };
export const Zero: Story = {
	args: { series: [{ key: "review", label: "Review agent", tone: "success", values: [0, 0, 0, 0] }] },
};
export const Empty: Story = { args: { days: [], series: [] } };

export const Grouped: Story = {
	args: {
		variant: "grouped",
		appearance: "overview",
		series: [
			{ key: "added", label: "Added", tone: "added", values: [20, 40, 30, 10] },
			{ key: "deleted", label: "Deleted", tone: "deleted", values: [10, 5, 20, 8] },
		],
	},
};
