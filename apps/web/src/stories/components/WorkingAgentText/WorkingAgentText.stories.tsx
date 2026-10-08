import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkingAgentText } from "@trellis/ui";

const meta = {
	title: "Components/WorkingAgentText",
	component: WorkingAgentText,
	args: { children: "Review agent", count: 1 },
} satisfies Meta<typeof WorkingAgentText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Several: Story = { args: { children: "3 agents", count: 3 } };
export const NoTooltip: Story = { args: { tooltip: false } };
export const LongContent: Story = { args: { children: "Review the release across every project" } };
