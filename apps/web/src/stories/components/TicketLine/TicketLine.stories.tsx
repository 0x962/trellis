import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusIcon, TicketLine } from "@trellis/ui";

const meta = {
	title: "Components/TicketLine",
	component: TicketLine,
	args: { identifier: "TRL-42", title: "Restore the project view", link: <a href="#ticket">Ticket</a> },
} satisfies Meta<typeof TicketLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithMark: Story = { args: { mark: <StatusIcon category="started" /> } };
export const LongTitle: Story = {
	args: { title: "Restore the project view and retain the selected tickets when a user returns from a review" },
};
