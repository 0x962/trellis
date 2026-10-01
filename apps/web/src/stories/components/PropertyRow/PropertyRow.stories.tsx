import type { Meta, StoryObj } from "@storybook/react-vite";
import { PropertyRow } from "@trellis/ui";

const meta = {
	title: "Components/PropertyRow",
	component: PropertyRow,
	args: { label: "Branch", children: <code>work/TRL-42</code> },
	render: (args) => (
		<dl className="w-full">
			<PropertyRow {...args} />
		</dl>
	),
} satisfies Meta<typeof PropertyRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Compact: Story = { args: { compact: true } };
export const LongContent: Story = {
	args: {
		align: "start",
		children: (
			<span className="break-all">/workspace/trellis/apps/web/src/features/project-settings/ProjectSettings.tsx</span>
		),
	},
};
