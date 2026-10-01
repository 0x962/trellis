import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResizeHandle } from "@trellis/ui";

const meta = {
	title: "Components/ResizeHandle",
	component: ResizeHandle,
	args: { label: "Panel width", value: 320, min: 240, max: 640 },
	parameters: {
		docs: {
			description: {
				component:
					"This primitive exposes the resize state and pointer target. The owning panel supplies drag and keyboard handlers.",
			},
		},
	},
	render: (args) => (
		<div className="h-60">
			<ResizeHandle {...args} />
		</div>
	),
} satisfies Meta<typeof ResizeHandle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Active: Story = { args: { active: true } };
export const Fixed: Story = { args: { min: 320, max: 320 } };
