import type { Meta, StoryObj } from "@storybook/react-vite";
import { TrellisWordmark } from "@trellis/ui";

const meta = {
	title: "Components/TrellisWordmark",
	component: TrellisWordmark,
} satisfies Meta<typeof TrellisWordmark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Short: Story = { args: { short: true } };
export const Large: Story = { args: { className: "h-8" } };
