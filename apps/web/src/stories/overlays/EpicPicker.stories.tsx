import type { Meta, StoryObj } from "@storybook/react-vite";
import { PickerButton } from "@trellis/ui";
import { EpicPicker } from "../../features/pickers/EpicPicker";
import { noop, pending, responses } from "./fixtures";

const meta = {
	title: "Overlays/EpicPicker",
	component: EpicPicker,
	args: { project: "DEMO", onPick: noop, trigger: <PickerButton label="Epic">Epic</PickerButton> },
	parameters: { trellis: { responses } },
} satisfies Meta<typeof EpicPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Disabled: Story = {
	args: {
		trigger: (
			<PickerButton label="Epic" disabled>
				Epic
			</PickerButton>
		),
	},
};
export const Open: Story = { args: { open: true } };
export const Selected: Story = { args: { open: true, value: "DEMO/catalog" } };
export const Mixed: Story = { args: { open: true, mixed: true } };
export const Empty: Story = {
	args: { open: true, allowNone: false },
	parameters: { trellis: { responses: { "epics.list": [] } } },
};
export const Loading: Story = {
	args: { open: true },
	parameters: { trellis: { responses: { "epics.list": pending } } },
};
