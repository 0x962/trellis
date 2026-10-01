import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "@trellis/ui";

const meta = {
	title: "Components/Skeleton",
	component: Skeleton,
	args: { width: "w-64" },
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const MultipleLines: Story = { args: { lines: 3 } };
export const Row: Story = { args: { width: "w-full", height: "h-10" } };
