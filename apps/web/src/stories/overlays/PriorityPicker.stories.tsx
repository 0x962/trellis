import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { PriorityPicker } from "../../features/pickers/PriorityPicker";
import { noop } from "./fixtures";

const meta = {
	title: "Overlays/PriorityPicker",
	component: PriorityPicker,
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
