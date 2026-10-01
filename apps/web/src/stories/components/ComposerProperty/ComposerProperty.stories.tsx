import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComposerProperty, StatusIcon } from "@trellis/ui";

const meta = {
	title: "Components/ComposerProperty",
	component: ComposerProperty,
	args: { children: "Todo", icon: <StatusIcon category="todo" /> },
} satisfies Meta<typeof ComposerProperty>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithDetail: Story = { args: { detail: "Priority" } };
export const Disabled: Story = { args: { disabled: true } };
export const LongContent: Story = { args: { children: "Wave with a long name in the selected epic" } };
