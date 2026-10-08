import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckStatusIcon } from "@trellis/ui/review";

const meta = {
	title: "Components/CheckStatusIcon",
	component: CheckStatusIcon,
	args: { status: "success" },
} satisfies Meta<typeof CheckStatusIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Failed: Story = { args: { status: "failed" } };
export const Pending: Story = { args: { status: "pending" } };
export const Running: Story = { args: { status: "running" } };
export const Canceled: Story = { args: { status: "canceled" } };
export const Skipped: Story = { args: { status: "skipped" } };
export const Neutral: Story = { args: { status: "neutral" } };
export const Unknown: Story = { args: { status: "unknown" } };
