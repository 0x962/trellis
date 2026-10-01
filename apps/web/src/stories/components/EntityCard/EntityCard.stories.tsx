import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, EntityCard } from "@trellis/ui";

const meta = {
	title: "Components/EntityCard",
	component: EntityCard,
	args: { title: "Review flow", description: "Review the code and request a human decision.", onEdit: () => {} },
} satisfies Meta<typeof EntityCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Link: Story = {
	render: ({ title, description }) => (
		<EntityCard title={title} description={description} link={<a href="#review-flow">Review flow</a>} />
	),
};
export const WithBadge: Story = { args: { badges: <Badge tone="ok">Enabled</Badge> } };
export const LongContent: Story = {
	args: {
		title: "Review every change in the current release",
		description: "The flow includes code review, checks, and a final human decision before the release.",
	},
};
