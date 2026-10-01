import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "@trellis/ui";

const meta = {
	title: "Components/Separator",
	component: Separator,
	render: (args) => (
		<div className="flex h-20 w-60 items-center gap-3">
			<span>Before</span>
			<Separator {...args} />
			<span>After</span>
		</div>
	),
} satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Vertical: Story = { args: { orientation: "vertical" } };
