import { DotsThree } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Menu } from "@trellis/ui";

const meta = {
	title: "Components/Menu",
	component: Menu,
	args: {
		label: "Ticket actions",
		triggerTooltip: "Ticket actions",
		trigger: <IconButton label="Ticket actions" icon={<DotsThree />} />,
		items: [
			{ label: "Edit", kbd: "E", onSelect: () => {} },
			{ label: "Pin", checked: true, onSelect: () => {} },
			{ label: "Archive", disabled: true, onSelect: () => {} },
			{ label: "Delete", danger: true, onSelect: () => {} },
		],
	},
	parameters: {
		docs: {
			description: {
				component:
					"Open the menu to inspect selected, disabled, and destructive actions. Arrow keys move focus. Enter selects an action.",
			},
		},
	},
} satisfies Meta<typeof Menu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Grouped: Story = {
	args: {
		items: [
			{ type: "group", label: "Ticket", items: [{ label: "Edit", onSelect: () => {} }] },
			{ type: "group", label: "Danger", items: [{ label: "Delete", danger: true, onSelect: () => {} }] },
		],
	},
};
