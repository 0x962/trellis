import type { Meta, StoryObj } from "@storybook/react-vite";
import { RankedBars } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/RankedBars",
	component: RankedBars,
	args: {
		label: "Usage by agent",
		rows: [
			{
				key: "review",
				label: "Review agent",
				value: 120,
				valueLabel: "120k",
				share: 0.6,
				tone: "success",
				spark: [1, 4, 2, 6],
			},
			{ key: "build", label: "Build agent", value: 80, valueLabel: "80k", share: 0.4, tone: "warning" },
		],
		selected: null,
		onSelect: () => {},
	},
	render: function Render(args) {
		const [selected, setSelected] = useStoryState(args.selected);
		return <RankedBars {...args} selected={selected} onSelect={setSelected} />;
	},
} satisfies Meta<typeof RankedBars>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { rows: [] } };
export const Selected: Story = { args: { selected: "review" } };
export const Overflow: Story = { args: { limit: 1 } };
