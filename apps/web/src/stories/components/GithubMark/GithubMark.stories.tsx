import type { Meta, StoryObj } from "@storybook/react-vite";
import { GithubMark } from "@trellis/ui";

const meta = {
	title: "Components/GithubMark",
	component: GithubMark,
	args: { "aria-label": "GitHub" },
} satisfies Meta<typeof GithubMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Large: Story = { args: { className: "size-8" } };
export const Decorative: Story = { args: { "aria-label": undefined } };
