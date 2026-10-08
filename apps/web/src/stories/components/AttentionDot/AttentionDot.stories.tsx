import type { Meta, StoryObj } from "@storybook/react-vite";
import { AttentionDot } from "@trellis/ui";

const meta = {
	title: "Components/AttentionDot",
	component: AttentionDot,
	args: { label: "A human decision is required" },
} satisfies Meta<typeof AttentionDot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Danger: Story = { args: { tone: "danger", label: "The agent run failed" } };
export const NoTooltip: Story = { args: { tooltip: false } };
