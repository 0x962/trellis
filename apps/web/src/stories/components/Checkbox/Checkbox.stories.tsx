import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Checkbox",
	component: Checkbox,
	args: { label: "Include completed tickets", checked: false, onCheckedChange: () => {} },
	parameters: { docs: { description: { component: "Click the control or press Space to change its value." } } },
	render: function Render(args) {
		const [checked, setChecked] = useStoryState(args.checked);
		return <Checkbox {...args} checked={checked} onCheckedChange={setChecked} />;
	},
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, checked: true } };
export const Mixed: Story = { args: { indeterminate: true } };
export const HiddenLabel: Story = { args: { hideLabel: true } };
