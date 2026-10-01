import type { Meta, StoryObj } from "@storybook/react-vite";
import { MergeConflictMark } from "@trellis/ui";

const meta = {
	title: "Components/MergeConflictMark",
	component: MergeConflictMark,
	args: { baseRef: "main" },
} satisfies Meta<typeof MergeConflictMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Medium: Story = { args: { size: "md" } };
export const LongBranch: Story = { args: { baseRef: "release/desktop-project-settings-and-ticket-selection" } };
