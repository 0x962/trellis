import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChoiceBoxes } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ChoiceBoxes",
	component: ChoiceBoxes,
	args: {
		label: "View",
		options: [
			{ value: "table", label: "Table" },
			{ value: "board", label: "Board" },
		],
		value: "table",
		onValueChange: () => {},
	},
	parameters: { docs: { description: { component: "Arrow keys select an option. Tab moves to the next control." } } },
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <ChoiceBoxes {...args} value={value} onValueChange={setValue} />;
	},
} satisfies Meta<typeof ChoiceBoxes>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SecondSelected: Story = { args: { value: "board" } };
export const Disabled: Story = { args: { disabled: true } };
