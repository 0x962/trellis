import { Funnel } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilterPopover, IconButton } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/FilterPopover",
	component: FilterPopover,
	args: {
		label: "Filter tickets",
		placeholder: "Search filters",
		open: false,
		onOpenChange: () => {},
		onSelect: () => {},
		trigger: <IconButton label="Filter tickets" icon={<Funnel />} />,
		items: [
			{ id: "todo", label: "Todo" },
			{ id: "started", label: "Started", checked: true },
			{ id: "review", label: "Review", checked: "mixed" },
		],
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		return <FilterPopover {...args} open={open} onOpenChange={setOpen} onSelect={() => setOpen(false)} />;
	},
} satisfies Meta<typeof FilterPopover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Empty: Story = { args: { open: true, items: [] } };
export const Stage: Story = { args: { open: true, stage: "Status" } };
