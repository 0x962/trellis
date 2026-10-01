import type { Meta, StoryObj } from "@storybook/react-vite";
import { PriorityIcon } from "@trellis/ui";

const meta = {
	title: "Components/PriorityIcon",
	component: PriorityIcon,
	args: { priority: "none" },
} satisfies Meta<typeof PriorityIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Low: Story = { args: { priority: "low" } };
export const Medium: Story = { args: { priority: "medium" } };
export const High: Story = { args: { priority: "high" } };
export const Urgent: Story = { args: { priority: "urgent" } };
