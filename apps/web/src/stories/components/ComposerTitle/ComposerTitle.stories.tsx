import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComposerTitle } from "@trellis/ui";

const meta = {
	title: "Components/ComposerTitle",
	component: ComposerTitle,
	args: { "aria-label": "Ticket title", defaultValue: "Restore the project view" },
} satisfies Meta<typeof ComposerTitle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { defaultValue: "", placeholder: "Ticket title" } };
export const Disabled: Story = { args: { disabled: true } };
export const LongContent: Story = {
	args: {
		defaultValue: "Restore the project view and retain the selected tickets when the user returns from a review",
	},
};
