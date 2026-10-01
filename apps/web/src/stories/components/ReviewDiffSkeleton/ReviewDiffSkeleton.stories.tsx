import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewDiffSkeleton } from "@trellis/ui/review";

const meta = {
	title: "Components/ReviewDiffSkeleton",
	component: ReviewDiffSkeleton,
} satisfies Meta<typeof ReviewDiffSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
