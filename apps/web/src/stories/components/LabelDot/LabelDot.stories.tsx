import type { Meta, StoryObj } from "@storybook/react-vite";
import { LabelDot, labelColors } from "@trellis/ui";

const meta = {
	title: "Components/LabelDot",
	component: LabelDot,
	args: { color: "blue" },
	render: (args) => (
		<div className="flex items-center gap-3">
			{labelColors.map((color) => (
				<span key={color} title={color}>
					<LabelDot {...args} color={color} />
				</span>
			))}
		</div>
	),
} satisfies Meta<typeof LabelDot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Icon: Story = { args: { variant: "icon" } };
export const AllColors: Story = { args: { color: "purple" } };
