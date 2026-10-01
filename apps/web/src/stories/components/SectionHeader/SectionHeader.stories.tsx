import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, SectionHeader, Tooltip } from "@trellis/ui";

const meta = {
	title: "Components/SectionHeader",
	component: SectionHeader,
	args: { title: "Sub-tickets", count: "3/5" },
} satisfies Meta<typeof SectionHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { count: 0 } };
export const Nested: Story = { args: { level: 3 } };
export const WithAction: Story = {
	args: {
		actions: (
			<Tooltip content="Add ticket">
				<IconButton label="Add ticket" icon={<Plus />} />
			</Tooltip>
		),
	},
};
export const LongTitle: Story = { args: { title: "Review the work from every ticket in this wave" } };

export const Overview: Story = {
	args: { level: 4, title: "PRs merged per day", appearance: "overview", count: undefined },
};
export const Prominent: Story = {
	args: {
		title: "Merged work",
		level: 3,
		appearance: "prominent",
		count: undefined,
		description: "Unique linked PRs and the lines they change.",
	},
};
