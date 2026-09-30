import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReviewStatus } from "@trellis/ui/review";

const meta = {
	title: "Components/ReviewStatus",
	component: ReviewStatus,
	args: { state: "open", isQueued: false, askedForReview: false, locallyApproved: false, word: "Not ready" },
} satisfies Meta<typeof ReviewStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Ready: Story = { args: { askedForReview: true, word: "Ready" } };
export const Approved: Story = { args: { askedForReview: true, locallyApproved: true, word: "Approved" } };
export const Queued: Story = { args: { isQueued: true, word: "Queued" } };
export const Merged: Story = { args: { state: "merged", word: "Merged" } };
export const Closed: Story = { args: { state: "closed", word: "Closed" } };
