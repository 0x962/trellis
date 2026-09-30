import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContextMenu, ContextMenuTrigger } from "@trellis/ui";

const meta = {
	title: "Components/ContextMenu",
	component: ContextMenu,
	args: {
		label: "Page actions",
		onClose: () => {},
		items: [
			{ label: "Edit", kbd: "E", onSelect: () => {} },
			{ label: "Pin", checked: true, onSelect: () => {} },
			{ label: "Archive", disabled: true, onSelect: () => {} },
			{ label: "Delete", danger: true, onSelect: () => {} },
		],
		children: (
			<ContextMenuTrigger
				render={
					<button type="button" className="rounded-md border border-border p-4">
						Page tab
					</button>
				}
			/>
		),
	},
	parameters: {
		docs: {
			description: {
				component:
					"Right-click the page tab or press Shift+F10 to open the menu. This story also renders ContextMenuTrigger.",
			},
		},
	},
} satisfies Meta<typeof ContextMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
