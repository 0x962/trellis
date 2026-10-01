import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrGlyph } from "@trellis/ui";

const meta = {
	title: "Components/PrGlyph",
	component: PrGlyph,
	args: { state: "open", askedForReview: false },
} satisfies Meta<typeof PrGlyph>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Ready: Story = { args: { askedForReview: true } };
export const Approved: Story = { args: { askedForReview: true, locallyApproved: true } };
export const Closed: Story = { args: { state: "closed" } };
export const Merged: Story = { args: { state: "merged" } };
export const Small: Story = { args: { size: "sm" } };
export const WithDetail: Story = { args: { description: "The evidence document does not cover this commit." } };
export const Decorative: Story = { args: { decorative: true } };
