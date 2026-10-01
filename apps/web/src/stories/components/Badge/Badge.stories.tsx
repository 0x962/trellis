import { Check } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@trellis/ui";

const meta = {
	title: "Components/Badge",
	component: Badge,
	args: { children: "Current" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Success: Story = { args: { tone: "ok" } };
export const ErrorState: Story = { args: { tone: "bad" } };
export const Waiting: Story = { args: { tone: "wait" } };
export const Agent: Story = { args: { tone: "agent" } };
export const Accent: Story = { args: { tone: "accent" } };
export const Small: Story = { args: { size: "sm" } };
export const WithIcon: Story = { args: { icon: <Check /> } };
export const LongContent: Story = { args: { children: "Waiting for a human decision" } };
