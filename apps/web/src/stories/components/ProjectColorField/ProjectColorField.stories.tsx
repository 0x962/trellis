import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectColorField, projectColors } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ProjectColorField",
	component: ProjectColorField,
	args: { value: "blue", taken: ["red", "green"], onValueChange: () => {} },
	parameters: {
		docs: {
			description: {
				component:
					"Select a color with the pointer or arrow keys. Reserved colors stay disabled. No color stays available.",
			},
		},
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <ProjectColorField {...args} value={value} onValueChange={setValue} />;
	},
} satisfies Meta<typeof ProjectColorField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoColor: Story = { args: { value: null } };
export const AllAvailable: Story = { args: { taken: [] } };
export const AllTaken: Story = { args: { value: null, taken: projectColors } };
