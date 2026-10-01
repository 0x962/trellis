import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@trellis/ui";

const meta = {
	title: "Components/Input",
	component: Input,
	args: { label: "Title", defaultValue: "Restore the project view", hint: "Name the work in one sentence." },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { defaultValue: "", placeholder: "Enter a title" } };
export const ErrorState: Story = { args: { error: "Enter a title." } };
export const Disabled: Story = { args: { disabled: true } };
export const ReadOnly: Story = { args: { readOnly: true, readOnlyReason: "This project is archived." } };
export const HiddenLabel: Story = { args: { hideLabel: true } };
export const LongContent: Story = {
	args: {
		defaultValue: "Restore the project view and retain the selected tickets when the user returns from a review.",
	},
};
