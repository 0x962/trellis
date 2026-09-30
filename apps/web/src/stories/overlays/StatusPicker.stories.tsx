import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { StatusPicker } from "../../features/pickers/StatusPicker";
import { noop, statuses } from "./fixtures";

const meta = {
	title: "Overlays/StatusPicker",
	component: StatusPicker,
	args: { statuses, onPick: noop, trigger: <PickerButton label="Status">Status</PickerButton> },
} satisfies Meta<typeof StatusPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Status" disabled>
				Status
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: statuses[1]!.id } };
export const Empty: Story = { args: { open: true, statuses: [] } };
