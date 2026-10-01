import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStateIcon } from "@trellis/ui";

const meta = {
	title: "Components/ReviewStateIcon",
	component: ReviewStateIcon,
	args: { reviewState: "none", notReady: false },
} satisfies Meta<typeof ReviewStateIcon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { reviewState: "review_required" } };
export const Approved: Story = { args: { reviewState: "approved" } };
export const ChangesRequested: Story = { args: { reviewState: "changes_requested" } };
export const NotReady: Story = { args: { notReady: true } };
export const NoTooltip: Story = { args: { tooltip: false } };
