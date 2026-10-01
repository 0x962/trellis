import type { Meta, StoryObj } from "@storybook/react-vite";
import { PinMark } from "@trellis/ui";

const meta = {
	title: "Components/PinMark",
	component: PinMark,
} satisfies Meta<typeof PinMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoTooltip: Story = { args: { tooltip: false } };
export const NotFocusable: Story = { args: { focusable: false } };
