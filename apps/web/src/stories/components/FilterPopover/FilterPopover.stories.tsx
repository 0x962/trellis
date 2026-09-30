import { Funnel } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilterPopover, IconButton } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useCommandItems } from "../useCommandItems";
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
	parameters: {
		docs: {
			description: {
				component: "Select a filter to change its check. Reopen the popup to inspect the local selection.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		const { items, groups, onSelect } = useCommandItems(args);
		return (
			<FilterPopover
				{...args}
				items={items}
				groups={groups}
				open={open}
				onOpenChange={setOpen}
				onSelect={(id) => {
					onSelect(id);
					setOpen(false);
				}}
			/>
		);
	},
} satisfies Meta<typeof FilterPopover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Empty: Story = { args: { open: true, items: [] } };
export const Stage: Story = { args: { open: true, stage: "Status" } };
export const ToggleSelection: Story = {
	play: async ({ canvasElement }) => {
		const trigger = within(canvasElement).getByRole("button", { name: "Filter tickets" });
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(trigger);
		await userEvent.click(await body.findByRole("option", { name: "Started" }));
		await userEvent.click(trigger);
		await expect(await body.findByRole("option", { name: "Started" })).toHaveAttribute("data-checked", "false");
		await userEvent.click(body.getByRole("option", { name: "Review" }));
		await userEvent.click(trigger);
		await expect(await body.findByRole("option", { name: "Review" })).toHaveAttribute("data-checked", "true");
		await userEvent.keyboard("{Escape}");
	},
};
