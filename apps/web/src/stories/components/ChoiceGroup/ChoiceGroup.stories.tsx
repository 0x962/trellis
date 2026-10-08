import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChoiceGroup } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ChoiceGroup",
	component: ChoiceGroup,
	args: {
		label: "View",
		options: [
			{ value: "table", label: "Table", description: "Show tickets in rows." },
			{ value: "board", label: "Board", description: "Group tickets by status." },
		],
		value: "table",
		onValueChange: () => {},
	},
	parameters: { docs: { description: { component: "Arrow keys select an option. Tab moves to the next control." } } },
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <ChoiceGroup {...args} value={value} onValueChange={setValue} />;
	},
} satisfies Meta<typeof ChoiceGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SecondSelected: Story = { args: { value: "board" } };
export const Disabled: Story = { args: { disabled: true } };
