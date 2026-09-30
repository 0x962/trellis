import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectKey, projectColors } from "@trellis/ui";

const meta = {
	title: "Components/ProjectKey",
	component: ProjectKey,
	args: { projectKey: "TRL", color: "blue" },
	render: (args) => (
		<div className="flex flex-wrap gap-3">
			<ProjectKey {...args} />
			{projectColors.map((color) => (
				<ProjectKey key={color} projectKey={color} color={color} />
			))}
		</div>
	),
} satisfies Meta<typeof ProjectKey>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoColor: Story = { args: { color: null } };
export const LongKey: Story = { args: { projectKey: "PROJECT" } };
