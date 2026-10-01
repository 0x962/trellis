import { DotsThree } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Popover } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Popover",
	component: Popover,
	args: {
		label: "Display options",
		trigger: <IconButton label="Display options" icon={<DotsThree />} />,
		triggerTooltip: "Display options",
		children: <p className="p-2 text-sm">Group tickets by status.</p>,
	},
	parameters: {
		docs: { description: { component: "Click the action to open the panel. Escape closes it and returns focus." } },
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		return <Popover {...args} open={open} onOpenChange={setOpen} />;
	},
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Above: Story = { args: { side: "top" } };
export const AlignEnd: Story = { args: { align: "end" } };
