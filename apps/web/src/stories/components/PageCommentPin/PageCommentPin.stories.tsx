import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageCommentPin } from "@trellis/ui";

const meta = {
	title: "Components/PageCommentPin",
	component: PageCommentPin,
	args: { number: 1, label: "Comment 1", x: 50, y: 50, resolved: false, selected: false, onClick: () => {} },
	render: (args) => (
		<div className="relative h-40">
			<PageCommentPin {...args} />
		</div>
	),
} satisfies Meta<typeof PageCommentPin>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Resolved: Story = { args: { resolved: true } };
export const LargeNumber: Story = { args: { number: 123 } };
