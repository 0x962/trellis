import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { PriorityPicker } from "../../features/pickers/PriorityPicker";
import { useStoryState } from "../components/useStoryState";
import { noop } from "./fixtures";
import { chooseAndReopen } from "./interactions";

const meta = {
	title: "Overlays/PriorityPicker",
	component: PriorityPicker,
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open ?? false);
		const [value, setValue] = useStoryState(args.value);
		return (
			<PriorityPicker
				{...args}
				open={open}
				value={value}
				onOpenChange={setOpen}
				onPick={(picked) => setValue(picked)}
			/>
		);
	},
	args: { onPick: noop, trigger: <PickerButton label="Priority">Priority</PickerButton> },
} satisfies Meta<typeof PriorityPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Priority" disabled>
				Priority
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: "high" } };

export const ChangeSelection: Story = {
	args: { open: false },
	play: chooseAndReopen("Priority", "High"),
};
