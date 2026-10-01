import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelPill } from "@trellis/ui";

const meta = {
	title: "Components/LabelPill",
	component: LabelPill,
	args: { name: "Bug", color: "red" },
} satisfies Meta<typeof LabelPill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Group: Story = { args: { group: "Type" } };
export const LongContent: Story = {
	args: { name: "Restore the project view and retain the selection", group: "Project area with a long name" },
};
