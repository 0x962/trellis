import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusIcon } from "@trellis/ui";

const meta = {
	title: "Components/StatusIcon",
	component: StatusIcon,
	args: { category: "todo", label: "Todo" },
} satisfies Meta<typeof StatusIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Started: Story = { args: { category: "started", label: "Started" } };
export const Review: Story = { args: { category: "review", label: "Review" } };
export const Done: Story = { args: { category: "done", label: "Done" } };
export const Canceled: Story = { args: { category: "canceled", label: "Canceled" } };
export const Queue: Story = { args: { category: "review", reviewShape: "queue", label: "In queue" } };
export const QuarterProgress: Story = { args: { category: "started", progress: 0.25, label: "One quarter complete" } };
export const FullProgress: Story = { args: { category: "started", progress: 1, label: "Complete" } };
export const CustomColor: Story = { args: { color: "agent" } };
export const Decorative: Story = { args: { label: undefined } };
