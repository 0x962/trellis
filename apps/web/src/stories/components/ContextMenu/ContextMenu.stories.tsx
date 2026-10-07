import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, ContextMenu, ContextMenuTrigger } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
	play: async ({ canvasElement, step }) => {
		const trigger = within(canvasElement).getByRole("button", { name: "Page tab" });
		const body = within(canvasElement.ownerDocument.body);
		await step("Open the checked Pin menu", async () => {
			await userEvent.pointer({ target: trigger, keys: "[MouseRight]" });
			const menu = await body.findByRole("menu", { name: "Page actions" });
			await waitFor(() => expect(menu).toBeVisible());
			await expect(within(menu).getByRole("menuitemcheckbox", { name: "Pin" })).toHaveAttribute("aria-checked", "true");
		});
		await step("Unpin and wait for the menu to close", async () => {
			const menu = body.getByRole("menu", { name: "Page actions" });
			await userEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Pin" }));
			await waitFor(() => expect(menu).not.toBeInTheDocument());
		});
		await step("Reopen the unchecked Pin menu", async () => {
			await userEvent.pointer({ target: trigger, keys: "[MouseRight]" });
			const menu = await body.findByRole("menu", { name: "Page actions" });
			await waitFor(() => expect(menu).toBeVisible());
			await expect(within(menu).getByRole("menuitemcheckbox", { name: "Pin" })).toHaveAttribute(
				"aria-checked",
				"false",
			);
			await userEvent.keyboard("{Escape}");
			await waitFor(() => expect(menu).not.toBeInTheDocument());
		});
	},
};
