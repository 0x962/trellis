import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActivityDot } from "@trellis/ui";

const meta = {
	title: "Components/ActivityDot",
	component: ActivityDot,
	args: { label: "The agent works", placement: "inline" },
	render: (args) => (
		<span className="relative inline-flex size-8 items-center justify-center rounded-md bg-surface">
			<ActivityDot {...args} />
		</span>
	),
} satisfies Meta<typeof ActivityDot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Metal: Story = { args: { tone: "metal" } };
export const NoTooltip: Story = { args: { tooltip: false } };
export const Corner: Story = { args: { placement: "corner" } };
