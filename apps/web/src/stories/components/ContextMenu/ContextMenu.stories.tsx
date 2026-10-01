import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, ContextMenu, ContextMenuTrigger } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useMenuItems } from "../useMenuItems";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ContextMenu",
	component: ContextMenu,
	args: {
		label: "Page actions",
		open: false,
		onClose: () => {},
		items: [
			{ label: "Edit", kbd: "E", onSelect: () => {} },
			{ label: "Pin", checked: true, onSelect: () => {} },
			{ label: "Archive", disabled: true, onSelect: () => {} },
			{ label: "Delete", danger: true, onSelect: () => {} },
		],
		children: <ContextMenuTrigger render={<Button>Page tab</Button>} />,
	},
	parameters: {
		docs: {
			description: {
				component:
					"Right-click the page tab or press Shift+F10 to open the menu. Select Pin to change its check. ContextMenuTrigger provides the target.",
			},
		},
	},
	render: function Render(args) {
		const items = useMenuItems(args.items);
		const [open, setOpen] = useStoryState(args.open);
		return <ContextMenu {...args} items={items} open={open} onOpenChange={setOpen} onClose={() => setOpen(false)} />;
	},
} satisfies Meta<typeof ContextMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const ToggleCheck: Story = {
	play: async ({ canvasElement }) => {
		const trigger = within(canvasElement).getByRole("button", { name: "Page tab" });
		const body = within(canvasElement.ownerDocument.body);
		const rect = trigger.getBoundingClientRect();
		const coords = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
		await userEvent.pointer({ target: trigger, keys: "[MouseRight]", coords });
		const pin = await body.findByRole("menuitemcheckbox", { name: "Pin" });
		await expect(pin).toHaveAttribute("aria-checked", "true");
		await userEvent.click(pin);
		await userEvent.pointer({ target: trigger, keys: "[MouseRight]", coords });
		await expect(await body.findByRole("menuitemcheckbox", { name: "Pin" })).toHaveAttribute("aria-checked", "false");
		await userEvent.keyboard("{Escape}");
	},
};
