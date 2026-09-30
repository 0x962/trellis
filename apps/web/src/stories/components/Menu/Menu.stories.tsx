import { DotsThree } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Menu } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useMenuItems } from "../useMenuItems";

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
					"Open the menu to inspect selected, disabled, and destructive actions. Select Pin to change its check. Arrow keys move focus.",
			},
		},
	},
	render: function Render(args) {
		const items = useMenuItems(args.items);
		return <Menu {...args} items={items} />;
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
export const ToggleCheck: Story = {
	play: async ({ canvasElement }) => {
		const trigger = within(canvasElement).getByRole("button", { name: "Ticket actions" });
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(trigger);
		const pin = await body.findByRole("menuitemcheckbox", { name: "Pin" });
		await expect(pin).toHaveAttribute("aria-checked", "true");
		await expect(body.getByRole("menuitem", { name: "Archive" })).toHaveAttribute("aria-disabled", "true");
		await userEvent.click(pin);
		await userEvent.click(trigger);
		await expect(await body.findByRole("menuitemcheckbox", { name: "Pin" })).toHaveAttribute("aria-checked", "false");
		await userEvent.keyboard("{Escape}");
	},
};
