import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectMark, projectColors } from "@trellis/ui";

const meta = {
	title: "Components/ProjectMark",
	component: ProjectMark,
	args: { color: "blue" },
	render: (args) => (
		<div className="flex flex-wrap gap-3">
			<ProjectMark {...args} />
			{projectColors.map((color) => (
				<ProjectMark key={color} {...args} color={color} />
			))}
		</div>
	),
} satisfies Meta<typeof ProjectMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoColor: Story = { args: { color: null } };
export const Large: Story = { args: { className: "size-8" } };
