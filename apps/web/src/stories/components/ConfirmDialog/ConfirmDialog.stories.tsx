import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog, IconButton, Tooltip } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ConfirmDialog",
	component: ConfirmDialog,
	args: {
		open: false,
		title: "Delete ticket",
		description: "Trellis cannot restore a deleted ticket.",
		confirmLabel: "Delete",
		onConfirm: () => {},
		onCancel: () => {},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		return (
			<>
				<Tooltip content="Delete ticket">
					<IconButton label="Delete ticket" icon={<Plus />} onClick={() => setOpen(true)} />
				</Tooltip>
				<ConfirmDialog {...args} open={open} onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
			</>
		);
	},
} satisfies Meta<typeof ConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Danger: Story = { args: { open: true, danger: true } };
export const Processing: Story = { args: { open: true, danger: true, processing: true } };
