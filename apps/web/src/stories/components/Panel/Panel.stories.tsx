import type { Meta, StoryObj } from "@storybook/react-vite";
import { Panel, SectionHeader, StatTile } from "@trellis/ui";

const meta = {
	title: "Components/Panel",
	component: Panel,
	args: {
		"aria-label": "Summary",
		className: "p-6",
		children: <StatTile label="PRs merged" value="28" size="large" />,
	},
} satisfies Meta<typeof Panel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithHeading: Story = {
	args: {
		children: (
			<SectionHeader
				title="Merged work"
				level={3}
				appearance="prominent"
				description="Unique linked PRs and the lines they change."
			/>
		),
	},
};
export const Narrow: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
