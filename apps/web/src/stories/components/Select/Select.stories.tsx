import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/Select",
	component: Select,
	args: {
		label: "Priority",
		hideLabel: false,
		items: [
			{ value: "none", label: "None" },
			{ value: "high", label: "High" },
			{ value: "urgent", label: "Urgent" },
		],
		value: "high",
		onValueChange: () => {},
	},
	parameters: {
		docs: { description: { component: "Open the control to inspect its popup. Arrow keys move the selection." } },
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <Select {...args} value={value} onValueChange={setValue} />;
	},
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const ErrorState: Story = { args: { error: "Select a priority." } };
export const ReadOnly: Story = { args: { readOnly: true, readOnlyReason: "This project is archived." } };
export const Placeholder: Story = { args: { value: "", placeholder: "Select a priority" } };
export const HiddenLabel: Story = { args: { hideLabel: true } };
export const Virtualized: Story = {
	args: {
		virtualized: true,
		items: Array.from({ length: 200 }, (_, index) => ({ value: `item-${index}`, label: `Option ${index + 1}` })),
		value: "item-120",
	},
};
