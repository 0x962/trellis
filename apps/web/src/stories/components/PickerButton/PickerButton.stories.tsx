import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";

const meta = {
	title: "Components/PickerButton",
	component: PickerButton,
	args: { label: "Model", children: "GPT-6 Astra" },
} satisfies Meta<typeof PickerButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: "sm" } };
export const Disabled: Story = { args: { disabled: true } };
export const LongContent: Story = { args: { children: "A model with a long name and a detailed variant" } };
