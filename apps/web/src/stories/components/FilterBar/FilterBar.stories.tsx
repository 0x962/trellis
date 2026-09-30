import { Funnel } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip, FilterBar, IconButton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

const meta = {
	title: "Components/FilterBar",
	component: FilterBar,
	args: {
		children: (
			<Tooltip content="Filter">
				<IconButton label="Filter" icon={<Funnel />} />
			</Tooltip>
		),
	},
	parameters: {
		docs: {
			description: {
				component: "The filtered bar contains a removable local chip. The long-filter story preserves both labels.",
			},
		},
	},
	render: (args) => (
		<div className="flex items-center gap-2">
			<FilterBar {...args} />
		</div>
	),
} satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filtered: Story = {
	render: function Render(args) {
		const [filtered, setFiltered] = useState(true);
		return (
			<div className="flex items-center gap-2">
				<FilterBar
					{...args}
					filters={filtered && <Chip label="Status" value="Todo" onRemove={() => setFiltered(false)} />}
				/>
			</div>
		);
	},
};
export const LongFilters: Story = {
	args: {
		filters: (
			<>
				<Chip label="Status" value="Todo, started, and review" />
				<Chip label="Epic" value="Release the next desktop version" />
			</>
		),
	},
};
export const RemoveFilter: Story = {
	...Filtered,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Remove Status" }));
		await expect(canvas.queryByText("Todo")).not.toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Filter" })).toBeVisible();
	},
};
