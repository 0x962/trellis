import type { Meta, StoryObj } from "@storybook/react-vite";
import { TicketId } from "@trellis/ui";

const meta = {
	title: "Components/TicketId",
	component: TicketId,
	args: { id: "TRL-42" },
} satisfies Meta<typeof TicketId>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: "sm" } };
export const LongIdentifier: Story = { args: { id: "PROJECT-1234567" } };
