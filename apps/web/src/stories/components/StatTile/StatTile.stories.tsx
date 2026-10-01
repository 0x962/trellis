import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatTile } from "@trellis/ui";

const meta = {
	title: "Components/StatTile",
	component: StatTile,
	args: { label: "Tokens", value: "1,234,567", detail: "24 sessions" },
} satisfies Meta<typeof StatTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Framed: Story = { args: { framed: true } };
export const Unavailable: Story = { args: { value: "Unavailable", detail: "The provider reports no total." } };
export const Danger: Story = { args: { label: "Disk space", value: "2.4 GB", valueClass: "text-danger" } };
export const LongContent: Story = {
	args: {
		label: "Usage across every account in the selected project",
		detail: "The report includes all local sessions.",
	},
};
