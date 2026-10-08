import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Dialog, IconButton, Input, Tooltip } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Dialog",
	component: Dialog,
	args: {
		open: false,
		title: "Edit project",
		description: "Change the project name.",
		onOpenChange: () => {},
		children: <Input label="Name" defaultValue="Trellis" />,
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		return (
			<>
				<Tooltip content="Edit project">
					<IconButton label="Edit project" icon={<Plus />} onClick={() => setOpen(true)} />
				</Tooltip>
				<Dialog {...args} open={open} onOpenChange={setOpen}>
					{args.children}
					<Button onClick={() => setOpen(false)}>Save</Button>
				</Dialog>
			</>
		);
	},
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Large: Story = { args: { open: true, size: "lg" } };
export const LongContent: Story = {
	args: { open: true, children: <p>{"The project contains tickets and waves. ".repeat(80)}</p> },
};
export const NonModal: Story = { args: { open: true, modal: false } };
