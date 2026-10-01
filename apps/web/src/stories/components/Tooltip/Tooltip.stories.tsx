import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";

const meta = {
	title: "Components/Tooltip",
	component: Tooltip,
	args: { content: "Add ticket", children: <IconButton label="Add ticket" icon={<Plus />} /> },
	parameters: {
		docs: { description: { component: "Hover or focus the action to open the tooltip. Escape closes it." } },
	},
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Description: Story = { args: { open: true, description: "Create a ticket in the current wave." } };
export const Bottom: Story = { args: { open: true, side: "bottom" } };
export const Left: Story = { args: { open: true, side: "left" } };
export const Right: Story = { args: { open: true, side: "right" } };
