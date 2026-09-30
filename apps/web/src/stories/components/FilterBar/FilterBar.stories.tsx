import { Funnel } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip, FilterBar, IconButton, Tooltip } from "@trellis/ui";

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
} satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Filtered: Story = { args: { filters: <Chip label="Status" value="Todo" onRemove={() => {}} /> } };
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
