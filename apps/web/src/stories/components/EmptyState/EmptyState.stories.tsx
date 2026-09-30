import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState, IconButton, Tooltip } from "@trellis/ui";

const meta = {
	title: "Components/EmptyState",
	component: EmptyState,
	args: { title: "No tickets", description: "Create a ticket to track work in this project." },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Page: Story = { args: { variant: "page" } };
export const WithoutImage: Story = { args: { image: null } };
export const WithAction: Story = {
	args: {
		action: (
			<Tooltip content="Add ticket">
				<IconButton label="Add ticket" icon={<Plus />} />
			</Tooltip>
		),
	},
};
